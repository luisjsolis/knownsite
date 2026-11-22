import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prerender, internalLinks, routeFile, loadChromium } from '../src/prerender.js';

test('routeFile and internalLinks', () => {
  assert.equal(routeFile('/'), 'index.html');
  assert.equal(routeFile('/blog/care/'), 'blog/care/index.html');
  const o = 'http://127.0.0.1:5000';
  assert.deepEqual(internalLinks(['/', '/pricing?x=1#top', 'about', '/logo.png', 'https://example.org/', '/docs/index.html', '/a.html', 'mailto:x@y.z'], o).sort(),
    ['/', '/a', '/about', '/docs', '/pricing']);
});

// A stand-in for Playwright's chromium: "renders" each route from a table, records what was served.
function fakeChromium(pages) {
  const served = [];
  return {
    served,
    launch: async () => ({
      close: async () => {},
      newPage: async () => {
        let current;
        return {
          goto: async (url) => {
            const res = await fetch(url); // goes to knownsite's local server
            served.push({ url, shell: (await res.text()).includes('id="root"></div>') });
            current = pages[new URL(url).pathname];
            if (current === undefined) throw new Error('net::ERR_ABORTED');
          },
          evaluate: async (fn) => (String(fn).includes('outerHTML')
            ? `<html><head><title>${current.title}</title></head><body><div id="root"><main>${current.body}</main>${(current.links ?? []).map((l) => `<a href="${l}">x</a>`).join('')}</div></body></html>`
            : current.links ?? []),
        };
      },
    }),
  };
}

test('prerender: crawls links from "/", writes route/index.html, keeps the shell as 200.html', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ks-pre-'));
  const dir = path.join(cwd, 'dist');
  await mkdir(path.join(dir, 'legal'), { recursive: true });
  const shell = '<!doctype html><html><head><title>App</title></head><body><div id="root"></div></body></html>';
  await writeFile(path.join(dir, 'index.html'), shell);
  await writeFile(path.join(dir, 'legal', 'index.html'), '<html><body><main>Real static legal page.</main></body></html>');
  const words = (n) => 'word '.repeat(n);
  const chromium = fakeChromium({
    '/': { title: 'Home', body: words(30), links: ['/pricing', '/legal', '/empty', '/broken', 'https://elsewhere.test/'] },
    '/pricing': { title: 'Pricing', body: words(25), links: ['/'] },
    '/legal': { title: 'Legal', body: words(25) },
    '/empty': { title: 'Empty', body: 'hi' },
    '/extra': { title: 'Extra', body: words(25) },
  });
  const r = await prerender({ cwd, dir, routes: ['/extra/'], chromium });
  assert.deepEqual(r.pages.map((p) => p.route), ['/', '/extra', '/pricing']);
  assert.deepEqual(Object.fromEntries(r.skipped.map((s) => [s.route, s.reason.split(':')[0]])),
    { '/legal': 'a static page already exists here', '/empty': 'only 1 words after rendering', '/broken': 'did not load' });
  assert.equal(await readFile(path.join(dir, '200.html'), 'utf8'), shell);
  assert.match(await readFile(path.join(dir, 'pricing', 'index.html'), 'utf8'), /prerendered by knownsite[\s\S]*Pricing/);
  assert.match(await readFile(path.join(dir, 'legal', 'index.html'), 'utf8'), /Real static legal page/, 'real pages untouched');
  assert.ok(chromium.served.every((s) => s.shell), 'every route is rendered from the original shell');

  // Second run: index.html is now prerendered; the shell comes from 200.html.
  const again = fakeChromium({ '/': { title: 'Home', body: words(30) } });
  const r2 = await prerender({ cwd, dir, crawl: false, chromium: again });
  assert.deepEqual(r2.pages.map((p) => p.route), ['/']);
  assert.ok(again.served.every((s) => s.shell));
  assert.equal(await readFile(path.join(dir, '200.html'), 'utf8'), shell);
});

test('prerender: clear errors without a build or without Playwright', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ks-pre-'));
  await assert.rejects(prerender({ cwd, dir: path.join(cwd, 'dist'), chromium: fakeChromium({}) }), /No index.html/);
  await writeFile(path.join(cwd, 'package.json'), '{}');
  await assert.rejects(loadChromium(cwd), /npm i -D playwright/);
});
