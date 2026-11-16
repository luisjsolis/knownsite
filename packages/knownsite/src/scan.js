// Find built HTML pages and extract what discovery needs, without dependencies.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = new Set(['_next', 'node_modules']);

export async function findHtmlFiles(root, dir = root) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await findHtmlFiles(root, full)));
    else if (entry.name.endsWith('.html')) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out.sort();
}

/** "index.html" -> "/", "about.html" -> "/about", "blog/index.html" -> "/blog". */
export function fileToPath(rel) {
  const p = rel.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return `/${p}`.replace(/\/$/, '') || '/';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4]);
  }
  return out;
}

function stripBlocks(html, tags) {
  for (const t of tags) html = html.replace(new RegExp(`<${t}\\b[\\s\\S]*?</${t}>`, 'gi'), ' ');
  return html;
}

/**
 * Canonical page text (proposed answer to SPEC open question 1): the <main> element if present,
 * else <body>, minus script/style/nav/header/footer, tags stripped, entities decoded,
 * whitespace collapsed.
 */
export function pageText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, ' ');
  s = stripBlocks(s, ['script', 'style', 'noscript', 'template', 'svg']);
  const main = s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const body = s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  s = main ? main[1] : body ? body[1] : s;
  s = stripBlocks(s, ['nav', 'header', 'footer']);
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseHtml(html) {
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.name ?? a.property)?.toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  let canonical;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.rel?.toLowerCase().split(/\s+/).includes('canonical')) canonical = a.href;
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const htmlTag = html.match(/<html\b[^>]*>/i);
  const text = pageText(html);
  return {
    title: titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : meta['og:title'] ?? '',
    description: meta.description ?? meta['og:description'] ?? '',
    lang: htmlTag ? attrs(htmlTag[0]).lang ?? '' : '',
    canonical,
    noindex: /\bnoindex\b/i.test(meta.robots ?? ''),
    hasJsonLd: /<script\b[^>]*type\s*=\s*["']?application\/ld\+json/i.test(html),
    text,
  };
}

export function summarize(description, text, max = 200) {
  if (description) return description;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)}…`;
}
