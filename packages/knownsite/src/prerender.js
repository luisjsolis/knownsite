// `knownsite prerender`: turn a single-page app's build (Vite, Bolt, Create React App, …) into real
// HTML pages that crawlers can read. Search and AI crawlers mostly don't run JavaScript, so an SPA's
// pages look empty to them (`<div id="root"></div>`).
//
// How: serve the build locally, open each route in a headless browser (Playwright, from your
// project), wait for it to render, and save the resulting HTML as <route>/index.html. Routes are
// found by following internal links from "/", plus any listed in knownsite.config.json
// ("prerender": { "routes": [...] }). The original empty shell is kept as 200.html: point your
// host's SPA fallback at it so routes that weren't prerendered still boot the app normally.
//
// Playwright is an optional peer dependency, loaded from your project only when you run this:
//   npm i -D playwright && npx playwright install chromium
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pageText } from './scan.js';

export const SHELL_FILE = '200.html';
const MARK = '<!-- prerendered by knownsite -->';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

const exists = async (p) => Boolean(await stat(p).catch(() => null));

/** Load Playwright's chromium from the user's project (not from knownsite's own dependencies). */
export async function loadChromium(cwd) {
  const req = createRequire(path.join(cwd, 'package.json'));
  for (const name of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(pathToFileURL(req.resolve(name)).href);
      return (mod.chromium ?? mod.default?.chromium);
    } catch {
      // try the next one
    }
  }
  throw new Error('knownsite prerender needs Playwright in your project:\n'
    + '  npm i -D playwright && npx playwright install chromium');
}

/** "/about" -> "about/index.html"; "/" -> "index.html". */
export function routeFile(route) {
  const clean = route.replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/index.html` : 'index.html';
}

/** Internal page links from rendered HTML: same origin, no assets, no query or hash. */
export function internalLinks(hrefs, origin) {
  const out = new Set();
  for (const h of hrefs) {
    let u;
    try {
      u = new URL(h, origin);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    if (/\.[a-z0-9]{1,5}$/i.test(u.pathname) && !u.pathname.endsWith('.html')) continue;
    const p = u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    out.add(p.length > 1 ? p.replace(/\/$/, '') : '/');
  }
  return [...out];
}

/** Static server over the build directory with an SPA fallback to the original shell. */
async function serve(dir, shell) {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, urlPath);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    // Real files (assets) are served; page routes always get the original shell, never an earlier
    // prerender, so every capture starts from the app itself.
    if (path.extname(urlPath) && urlPath !== '/index.html') {
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' }).end(body);
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    res.writeHead(200, { 'content-type': TYPES['.html'] }).end(shell);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/**
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {string} opts.dir           build output directory (absolute)
 * @param {string[]} [opts.routes]    always prerender these (in addition to discovered links)
 * @param {boolean} [opts.crawl=true] follow internal links from "/"
 * @param {number} [opts.max=200]
 * @param {number} [opts.minWords=20] a page with fewer words after rendering is not saved
 * @param {object} [opts.chromium]    Playwright's chromium (tests); default: from the project
 */
export async function prerender({ cwd, dir, routes = [], crawl = true, max = 200, minWords = 20, timeoutMs = 20_000, chromium }) {
  const indexFile = path.join(dir, 'index.html');
  const shellFile = path.join(dir, SHELL_FILE);
  if (!(await exists(indexFile))) throw new Error(`No index.html in ${dir}. Run your build first, or set "outDir".`);
  // Re-running on a dir we already prerendered: the shell is in 200.html, not index.html.
  const index = await readFile(indexFile, 'utf8');
  const shell = index.includes(MARK) && (await exists(shellFile)) ? await readFile(shellFile, 'utf8') : index;

  const browserType = chromium ?? (await loadChromium(cwd));
  const { server, origin } = await serve(dir, shell);
  const browser = await browserType.launch();
  const done = new Map(); // route -> { words } | { skipped }
  const queue = [...new Set(['/', ...routes.map((r) => (r.length > 1 ? r.replace(/\/$/, '') : r))])];
  try {
    const page = await browser.newPage();
    while (queue.length && done.size < max) {
      const route = queue.shift();
      if (done.has(route)) continue;
      try {
        await page.goto(origin + route, { waitUntil: 'networkidle', timeout: timeoutMs });
      } catch (err) {
        done.set(route, { skipped: `did not load: ${err.message.split('\n')[0]}` });
        continue;
      }
      const html = `<!doctype html>\n${MARK}\n${await page.evaluate(() => document.documentElement.outerHTML)}`;
      const words = pageText(html).split(/\s+/).filter(Boolean).length;
      if (words < minWords) { done.set(route, { skipped: `only ${words} words after rendering` }); continue; }
      const target = path.join(dir, routeFile(route));
      // Never overwrite a real page the build produced itself (only the SPA shell is replaced).
      if (route !== '/' && (await exists(target)) && !(await readFile(target, 'utf8')).includes(MARK)) {
        done.set(route, { skipped: 'a static page already exists here' });
        continue;
      }
      if (route === '/' && !(await exists(shellFile))) await writeFile(shellFile, shell);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, html.replaceAll(origin, ''));
      done.set(route, { words });
      if (crawl) {
        const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
        for (const l of internalLinks(hrefs, origin)) if (!done.has(l) && !queue.includes(l)) queue.push(l);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return {
    pages: [...done].filter(([, v]) => v.words).map(([route, v]) => ({ route, words: v.words, file: routeFile(route) })),
    skipped: [...done].filter(([, v]) => v.skipped).map(([route, v]) => ({ route, reason: v.skipped })),
    truncated: queue.length > 0,
    shell: SHELL_FILE,
  };
}
