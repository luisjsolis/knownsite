import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, robotsAllows, checkSite, rankFixes, crawlerText } from '../src/check.js';

test('robots.txt: specific group beats *, longest match wins, Allow wins ties, wildcards', () => {
  const r = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/ok$

User-agent: GPTBot
User-agent: OAI-SearchBot
Disallow: /

Sitemap: https://example.com/sitemap.xml
`);
  assert.deepEqual(r.sitemaps, ['https://example.com/sitemap.xml']);
  assert.equal(robotsAllows(r, 'Googlebot', '/').allowed, true);
  assert.equal(robotsAllows(r, 'Googlebot', '/private/x').allowed, false);
  assert.equal(robotsAllows(r, 'Googlebot', '/private/ok').allowed, true);
  assert.equal(robotsAllows(r, 'Googlebot', '/private/ok/more').allowed, false);
  assert.equal(robotsAllows(r, 'oai-searchbot', '/').allowed, false);
  assert.equal(robotsAllows(r, 'GPTBot', '/').allowed, false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /*.pdf$'), 'Bingbot', '/a.pdf').allowed, false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:'), 'Bingbot', '/').allowed, true);
  const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a');
  assert.equal(robotsAllows(tie, 'Bingbot', '/a').allowed, true);
  assert.equal(robotsAllows(parseRobots(''), 'Bingbot', '/').allowed, true);
});

function fakeFetch(routes) {
  return async (url, opts = {}) => {
    const ua = opts.headers?.['user-agent'] ?? '';
    const route = routes[url];
    const r = typeof route === 'function' ? route(ua, opts) : route;
    if (!r) return new Response('not found', { status: 404 });
    const res = new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers ?? {} });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };
}

const goodHtml = `<!doctype html><html lang="en"><head>
<title>Acme Widgets — hand-made widgets</title>
<meta name="description" content="Acme makes durable hand-made widgets for homes and offices, shipped worldwide.">
<link rel="canonical" href="https://acme.test/">
<meta property="og:title" content="Acme"><meta property="og:description" content="Widgets"><meta property="og:image" content="https://acme.test/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
</head><body><main>${'widget '.repeat(250)}</main></body></html>`;

test('checkSite: a well-configured site scores high', async () => {
  const fetchImpl = fakeFetch({
    'https://acme.test/': { body: goodHtml },
    'https://acme.test/robots.txt': { body: 'User-agent: *\nAllow: /\nSitemap: https://acme.test/sitemap.xml' },
    'https://acme.test/sitemap.xml': { body: '<urlset><url><loc>https://acme.test/</loc><lastmod>2026-11-01</lastmod></url></urlset>' },
    'https://acme.test/llms.txt': { body: '# Acme\n\n> Widgets.' },
    'http://acme.test/': { status: 301, headers: { location: 'https://acme.test/' } },
  });
  const r = await checkSite('acme.test', { fetchImpl, verify: async () => ({ level: 0 }) });
  assert.equal(r.critical.length, 0);
  assert.equal(r.checks.reduce((n, c) => n + c.max, 0), 100);
  assert.equal(r.score, 85); // everything but IndexNow (unknown) and Knownsite
  assert.equal(r.band, 'discoverable');
  assert.ok(r.crawlers.every((c) => c.status === 'pass'));
});

test('checkSite: SPA shell, blocked AI bots and firewall challenge are caught', async () => {
  const shell = '<html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>';
  const fetchImpl = fakeFetch({
    'https://spa.test/': (ua) => (/PerplexityBot/.test(ua) ? { status: 403, body: 'denied' } : { body: shell }),
    'https://spa.test/robots.txt': { body: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: Claude-SearchBot\nDisallow: /' },
    'http://spa.test/': { status: 200 },
  });
  const r = await checkSite('https://spa.test/', { fetchImpl, verify: async () => ({ level: 0 }) });
  const by = Object.fromEntries(r.crawlers.map((c) => [c.token, c]));
  assert.equal(by['OAI-SearchBot'].status, 'fail');
  assert.equal(by['Claude-SearchBot'].status, 'fail');
  assert.equal(by.PerplexityBot.status, 'warn');
  assert.equal(by.Googlebot.status, 'pass');
  assert.ok(r.critical.some((c) => /without JavaScript/.test(c)));
  assert.ok(r.score <= 40);
  assert.equal(r.band, 'mostly-invisible');
  assert.equal(rankFixes(r)[0].id, 'content.no-js');
});

test('checkSite: blank shell on a host that pre-renders for verified crawlers is "?", not critical', async () => {
  const shell = '<html><head><title>App</title></head><body><div id="root"></div><script src="/__l5e/events"></script></body></html>';
  const md = '---\ntitle: "App"\n---\n\n' + 'portfolio '.repeat(120);
  const fetchImpl = fakeFetch({
    'https://app.lovable.app/': (ua, opts) => (opts.headers.accept === 'text/markdown'
      ? { body: md, headers: { 'content-type': 'text/markdown; charset=utf-8' } } : { body: shell }),
  });
  const r = await checkSite('https://app.lovable.app/', { fetchImpl, verify: async () => ({ level: 0 }) });
  const c = r.checks.find((x) => x.id === 'content.no-js');
  assert.equal(c.status, 'unknown');
  assert.equal(c.points, 7);
  assert.match(c.message, /Lovable renders pages for verified crawlers/);
  assert.match(c.message, /Markdown version has 120 words/);
  assert.ok(!r.critical.some((x) => /without JavaScript/.test(x)));
  assert.deepEqual({ ...r.rendering, words: undefined }, { words: undefined, spaShell: true, prerenderHost: 'Lovable', markdownWords: 120 });
  assert.ok(r.notes.some((n) => /verified crawlers only \(Lovable\)/.test(n)));
});

test('checkSite: Lovable-built but hosted elsewhere stays a real failure', async () => {
  const shell = '<html><head><title>App</title><script src="https://cdn.gpteng.co/gptengineer.js"></script></head><body><div id="root"></div></body></html>';
  const fetchImpl = fakeFetch({ 'https://motel.test/': { body: shell } });
  const r = await checkSite('https://motel.test/', { fetchImpl, verify: async () => ({ level: 0 }) });
  assert.equal(r.checks.find((x) => x.id === 'content.no-js').status, 'fail');
  assert.equal(r.rendering.prerenderHost, null);
  assert.ok(r.critical.some((x) => /without JavaScript/.test(x)));
});

test('checkSite: any host that serves a Markdown version gets "?" instead of a failure', async () => {
  const shell = '<html><head><title>App</title></head><body><div id="app"></div></body></html>';
  const fetchImpl = fakeFetch({
    'https://md.test/': (ua, opts) => (opts.headers.accept === 'text/markdown'
      ? { body: 'word '.repeat(80), headers: { 'content-type': 'text/markdown' } } : { body: shell }),
  });
  const r = await checkSite('https://md.test/', { fetchImpl, verify: async () => ({ level: 0 }) });
  const c = r.checks.find((x) => x.id === 'content.no-js');
  assert.equal(c.status, 'unknown');
  assert.match(c.message, /may render pages for verified crawlers; its Markdown version has 80 words/);
});

test('checkSite: noindex zeroes crawler points and is critical', async () => {
  const fetchImpl = fakeFetch({
    'https://n.test/': { body: goodHtml.replace('<head>', '<head><meta name="robots" content="noindex">') },
  });
  const r = await checkSite('https://n.test/', { fetchImpl, verify: async () => ({ level: 0 }) });
  assert.ok(r.critical.some((c) => /noindex/.test(c)));
  assert.ok(r.crawlers.every((c) => c.points === 0));
  assert.ok(r.crawlers.every((c) => /noindex/.test(c.message)));
});

test('checkSite: unreachable site', async () => {
  const r = await checkSite('https://down.test/', { fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
  assert.equal(r.band, 'unreachable');
  assert.equal(r.score, 0);
});

test('crawlerText counts nav/header/noscript text, skips scripts and styles', () => {
  const html = `<html><head><title>T</title></head><body><div id="root"><div style="position:absolute;clip:rect(0,0,0,0)">
<main><header><h1>Parlai</h1><p>An AI platform</p></header><nav><a href="/a">Partners</a> page</nav></main></div></div>
<noscript>Enable JavaScript please</noscript><script>var hidden = "nope";</script><style>.x{}</style></body></html>`;
  const t = crawlerText(html);
  assert.equal(t, 'Parlai An AI platform Partners page Enable JavaScript please');
});
