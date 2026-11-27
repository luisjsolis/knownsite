import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, robotsAllows } from '../src/robots.js';

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
