// `knownsite check <url>`: score how discoverable a live site is by search engines and AI assistants,
// from the outside, the way a crawler sees it. Design: CHECKER.md (draft 0.1).
import { parseHtml, decodeEntities } from './scan.js';
import { verifySite } from './verify.js';

export const CHECK_VERSION = '0.1';
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 3_000_000;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Search crawlers: scored. Each is tested against robots.txt and with a real request using its UA.
export const SEARCH_CRAWLERS = [
  { token: 'Googlebot', who: 'Google Search', max: 7,
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { token: 'Bingbot', who: 'Bing (also feeds ChatGPT, Copilot, DuckDuckGo)', max: 7,
    ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' },
  { token: 'OAI-SearchBot', who: 'ChatGPT search', max: 6,
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)' },
  { token: 'Claude-SearchBot', who: 'Claude', max: 5,
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)' },
  { token: 'PerplexityBot', who: 'Perplexity', max: 5,
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' },
];
const AI_SEARCH = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
// Training crawlers: reported, never scored. Blocking them is the owner's choice.
export const TRAINING_CRAWLERS = [
  { token: 'GPTBot', who: 'OpenAI model training' },
  { token: 'ClaudeBot', who: 'Anthropic model training' },
  { token: 'Google-Extended', who: 'Google Gemini training' },
];

// ---------- robots.txt (RFC 9309) ----------

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (current) current.rules.push({ allow: key === 'allow', pattern: value });
      lastWasAgent = false;
    } else if (key === 'sitemap') {
      if (value) sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function patternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}

/** Is `path` allowed for crawler `token`? Longest match wins; Allow wins ties. */
export function robotsAllows(robots, token, path = '/') {
  const t = token.toLowerCase();
  let groups = robots.groups.filter((g) => g.agents.includes(t));
  if (!groups.length) groups = robots.groups.filter((g) => g.agents.includes('*'));
  const rules = groups.flatMap((g) => g.rules).filter((r) => r.pattern !== '');
  let best = null;
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return { allowed: best ? best.allow : true, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.pattern}` : null };
}

// ---------- fetching ----------

async function readCapped(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function makeGet(fetchImpl) {
  return async (url, { ua = BROWSER_UA, redirect = 'follow', accept = 'text/html,application/xhtml+xml,text/plain,*/*' } = {}) => {
    try {
      const res = await fetchImpl(url, {
        redirect,
        headers: { 'user-agent': ua, accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = redirect === 'manual' ? '' : await readCapped(res);
      return { ok: res.ok, status: res.status, url: res.url || url, headers: res.headers, text };
    } catch (err) {
      return { ok: false, status: 0, url, headers: new Headers(), text: '', error: err.name === 'TimeoutError' ? 'timed out' : err.message };
    }
  };
}

const looksLikeChallenge = (r) =>
  r.headers.get('cf-mitigated') === 'challenge' ||
  r.headers.has('x-vercel-mitigated') ||
  /<title>\s*(Just a moment|Attention Required|Access denied|Vercel Security Checkpoint)/i.test(r.text);

// Hosts that render pages for *verified* crawlers (checked by IP), so a spoofed user agent from
// outside gets the empty app shell while Googlebot, Bingbot, OAI-SearchBot, Claude and Perplexity
// get a rendered page. A blank page there can't be confirmed as blank, so it is reported as "?".
// Match the host, not the builder: a Lovable-built site hosted elsewhere gets no pre-rendering.
const PRERENDER_HOSTS = [
  { name: 'Lovable', test: (url, html) => /\.lovable\.app$/i.test(url.hostname) || /["'(]\/__l5e\//.test(html),
    fix: 'In Lovable, run "Migrate to TanStack Start" so every visitor and tool gets the full page, not only verified crawlers' },
];

/** Markdown version of the page, if the host serves one on `Accept: text/markdown` (Lovable does). */
async function markdownWords(get, url) {
  const r = await get(url, { accept: 'text/markdown' });
  if (!r.ok || !/markdown/i.test(r.headers.get('content-type') ?? '')) return null;
  return wordCount(r.text.replace(/^---\n[\s\S]*?\n---\n/, ''));
}

const wordCount = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

/**
 * All text a crawler that does not run JavaScript can read: the whole <body> (nav, header,
 * footer and <noscript> included) minus scripts, styles and templates. Not scan.js pageText(),
 * which keeps only the main content on purpose and would miss e.g. a builder's SEO snapshot
 * that lives inside <header>/<nav>.
 */
export function crawlerText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const body = s.match(/<body\b[^>]*>([\s\S]*)/i);
  s = body ? body[1] : s;
  for (const t of ['script', 'style', 'template', 'svg']) s = s.replace(new RegExp(`<${t}\\b[\\s\\S]*?</${t}>`, 'gi'), ' ');
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function jsonLdTypes(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set();
  let invalid = 0;
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const t of [node['@type']].flat()) if (typeof t === 'string') types.add(t);
    if (node['@graph']) walk(node['@graph']);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b[1])); } catch { invalid++; }
  }
  return { blocks: blocks.length, invalid, types: [...types] };
}

// ---------- the check ----------

export async function checkSite(input, { fetchImpl = fetch, verify = verifySite } = {}) {
  const get = makeGet(fetchImpl);
  const startUrl = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).href;
  const checks = [];
  const critical = [];
  const add = (c) => { checks.push(c); return c; };

  const home = await get(startUrl);
  if (home.status === 0 || (!home.ok && !home.text)) {
    return { url: startUrl, scannedAt: new Date().toISOString(), version: CHECK_VERSION, score: 0, band: 'unreachable',
      critical: [`Could not load ${startUrl}: ${home.error ?? `HTTP ${home.status}`}`], checks: [], crawlers: [], training: [] };
  }
  const finalUrl = new URL(home.url);
  const origin = finalUrl.origin;
  const page = parseHtml(home.text);

  const [robotsRes, llms, httpRedirect, knownsite, ...probes] = await Promise.all([
    get(`${origin}/robots.txt`, { ua: SEARCH_CRAWLERS[0].ua }),
    get(`${origin}/llms.txt`),
    get(`http://${finalUrl.host}/`, { redirect: 'manual' }),
    verify(origin, { fetchImpl }).catch(() => ({ level: 0, checks: [] })),
    ...SEARCH_CRAWLERS.map((c) => get(finalUrl.href, { ua: c.ua })),
  ]);

  // robots.txt: a 4xx means "no rules" (everything allowed); 5xx/unreachable means crawlers back off.
  const robotsText = robotsRes.ok && !/<html/i.test(robotsRes.text.slice(0, 500)) ? robotsRes.text : '';
  const robots = parseRobots(robotsText);
  const robotsNote = robotsRes.ok ? (robotsText ? null : 'robots.txt returned HTML, treated as missing')
    : robotsRes.status >= 500 || robotsRes.status === 0 ? `robots.txt failed (${robotsRes.error ?? `HTTP ${robotsRes.status}`}); crawlers may treat the site as blocked`
    : 'no robots.txt (everything allowed)';
  const robotsPath = finalUrl.pathname + finalUrl.search;

  // 1. Crawlers (30)
  const noindexHeader = /\bnoindex\b/i.test(home.headers.get('x-robots-tag') ?? '');
  const noindex = page.noindex || noindexHeader;
  const crawlers = SEARCH_CRAWLERS.map((c, i) => {
    const r = robotsAllows(robots, c.token, robotsPath);
    const p = probes[i];
    const blockedByServer = !p.ok || looksLikeChallenge(p);
    const browserOk = home.ok && !looksLikeChallenge(home);
    let status; let points; let message; let fix = null;
    if (!r.allowed) {
      status = 'fail'; points = 0;
      message = `robots.txt blocks ${c.token} (${r.rule})`;
      fix = `Remove the "${r.rule}" rule for ${c.token} (or the * group) in robots.txt`;
    } else if (blockedByServer && browserOk) {
      // Some firewalls verify crawlers by IP, so a spoofed UA can be refused while the real bot is let in.
      status = 'warn'; points = Math.floor(c.max / 2);
      message = `robots.txt allows it, but the server answered our ${c.token} request with ${looksLikeChallenge(p) ? 'a bot challenge' : `HTTP ${p.status || p.error}`}`;
      fix = `Check your firewall / bot protection allows ${c.token} (verified bots are often allowed by IP; confirm in your host's logs)`;
    } else {
      status = 'pass'; points = c.max;
      message = r.rule ? `allowed (${r.rule})` : 'allowed';
    }
    if (noindex) { points = 0; status = 'fail'; message = `${message}, but the homepage is marked noindex`; }
    return { ...c, robotsAllowed: r.allowed, rule: r.rule, httpStatus: p.status, challenge: looksLikeChallenge(p), status, points, message, fix };
  });
  for (const c of crawlers) {
    add({ id: `crawlers.${c.token.toLowerCase()}`, group: 'crawlers', status: c.status, points: c.points, max: c.max,
      message: `${c.token} (${c.who}): ${c.message}`, fix: c.fix });
  }
  if (noindex) {
    critical.push(`The homepage says "noindex" (${noindexHeader ? 'X-Robots-Tag header' : '<meta name="robots">'}): search engines and AI search will drop it.`);
    add({ id: 'crawlers.noindex', group: 'crawlers', status: 'fail', points: 0, max: 0,
      message: 'Homepage is marked noindex', fix: 'Remove noindex from the robots meta tag / X-Robots-Tag header' });
  }
  if (AI_SEARCH.every((t) => crawlers.find((c) => c.token === t).status === 'fail') && !noindex) {
    critical.push('All AI search crawlers (ChatGPT, Claude, Perplexity) are blocked.');
  }
  const training = TRAINING_CRAWLERS.map((c) => ({ ...c, ...robotsAllows(robots, c.token, robotsPath) }));

  // 2. Readable without JavaScript (15)
  const words = wordCount(crawlerText(home.text));
  const spaShell = /<div\b[^>]*id=["'](root|app|__next|svelte)["'][^>]*>\s*<\/div>/i.test(home.text);
  const prerenderHost = words < 200 ? PRERENDER_HOSTS.find((h) => h.test(finalUrl, home.text)) ?? null : null;
  const mdWords = words < 200 ? await markdownWords(get, finalUrl.href) : null;
  let renderNote = null;
  const rendering = { words, spaShell, prerenderHost: prerenderHost?.name ?? null, markdownWords: mdWords };
  if (words < 200 && (prerenderHost || mdWords >= 50)) {
    // Can't see what verified crawlers get: half points, "?", and not a critical finding.
    const how = prerenderHost ? `${prerenderHost.name} renders pages for verified crawlers (Google, Bing, ChatGPT, Claude, Perplexity), which can't be confirmed from outside` : 'the server may render pages for verified crawlers';
    add({ id: 'content.no-js', group: 'content', max: 15, points: 7, status: 'unknown',
      message: `${words} words in the HTML for unverified visitors; ${how}${mdWords !== null ? `; its Markdown version has ${mdWords} words` : ''}`,
      fix: prerenderHost?.fix ?? 'Render on the server or at build time so every visitor and tool gets the same full page' });
    renderNote = `Rendered for verified crawlers only${prerenderHost ? ` (${prerenderHost.name})` : ''}: tools outside the host's verified list (link checkers, smaller AI tools, this checker) see ${words} words.`;
  } else {
    add({ id: 'content.no-js', group: 'content', max: 15,
      points: words >= 200 ? 15 : words >= 50 ? 7 : 0,
      status: words >= 200 ? 'pass' : words >= 50 ? 'warn' : 'fail',
      message: `${words} words of text in the HTML before JavaScript runs${spaShell && words < 50 ? ' (empty app shell: content is rendered in the browser)' : ''}`,
      fix: words >= 200 ? null : 'Use server-side rendering or static export (prerendering) so crawlers that do not run JavaScript see your content' });
    if (words < 50) critical.push(`Only ${words} words are visible without JavaScript; most AI crawlers will see an empty page.`);
  }

  // 3. Sitemap (10)
  const sitemapUrls = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
  const sm = await get(sitemapUrls[0]);
  const locs = sm.ok ? [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]) : [];
  const sameHost = locs.filter((l) => { try { return new URL(l).host === finalUrl.host; } catch { return false; } });
  const lastmods = sm.ok ? [...sm.text.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)].map((m) => m[1]).sort() : [];
  const isIndex = /<sitemapindex/i.test(sm.text);
  const smValid = sm.ok && /<(urlset|sitemapindex)\b/i.test(sm.text) && sameHost.length > 0;
  add({ id: 'sitemap', group: 'sitemap', max: 10,
    points: smValid ? 10 : sm.ok && sm.text.trim() ? 3 : 0,
    status: smValid ? 'pass' : sm.ok && sm.text.trim() ? 'warn' : 'fail',
    message: smValid
      ? `${sitemapUrls[0]}: ${sameHost.length} ${isIndex ? 'sitemaps' : 'URLs'}${lastmods.length ? `, newest lastmod ${lastmods.at(-1)}` : ''}${robots.sitemaps.length ? '' : ' (not listed in robots.txt)'}`
      : sm.ok ? `${sitemapUrls[0]} exists but has no URLs on ${finalUrl.host}` : `No sitemap at ${sitemapUrls[0]}`,
    fix: smValid ? (robots.sitemaps.length ? null : `Add "Sitemap: ${sitemapUrls[0]}" to robots.txt`) : 'Publish /sitemap.xml listing your pages and reference it from robots.txt' });

  // 4. Page basics (15)
  const og = page.title && /<meta\b[^>]*property=["']og:title/i.test(home.text) &&
    /<meta\b[^>]*property=["']og:description/i.test(home.text) && /<meta\b[^>]*property=["']og:image/i.test(home.text);
  let canonicalOk = false;
  try { canonicalOk = Boolean(page.canonical) && new URL(page.canonical, finalUrl).host === finalUrl.host; } catch {}
  const httpsRedirects = httpRedirect.status >= 300 && httpRedirect.status < 400 &&
    /^https:/i.test(httpRedirect.headers.get('location') ?? '');
  const basics = [
    ['basics.title', 3, page.title.length >= 10 && page.title.length <= 70, `Title: ${page.title ? `"${page.title}" (${page.title.length} chars)` : 'missing'}`, 'Add a <title> of 10–70 characters'],
    ['basics.description', 3, page.description.length >= 50 && page.description.length <= 160, `Meta description: ${page.description ? `${page.description.length} chars` : 'missing'}`, 'Add a meta description of 50–160 characters'],
    ['basics.canonical', 2, canonicalOk, `Canonical link: ${page.canonical ?? 'missing'}`, 'Add <link rel="canonical"> pointing at this page on your own domain'],
    ['basics.lang', 2, Boolean(page.lang), `<html lang>: ${page.lang || 'missing'}`, 'Set <html lang="en"> (or your language)'],
    ['basics.open-graph', 2, og, `Open Graph title/description/image: ${og ? 'present' : 'incomplete'}`, 'Add og:title, og:description and og:image meta tags'],
    ['basics.https', 3, finalUrl.protocol === 'https:' && httpsRedirects, `HTTPS: ${finalUrl.protocol === 'https:' ? 'yes' : 'no'}, http→https redirect: ${httpsRedirects ? 'yes' : `no (HTTP ${httpRedirect.status || httpRedirect.error})`}`, 'Serve over HTTPS and redirect http:// to https://'],
  ];
  for (const [id, max, ok, message, fix] of basics) {
    add({ id, group: 'basics', max, points: ok ? max : 0, status: ok ? 'pass' : 'fail', message, fix: ok ? null : fix });
  }

  // 5. Structured data (10)
  const ld = jsonLdTypes(home.text);
  const ldOk = ld.types.length > 0;
  add({ id: 'structured-data', group: 'structured-data', max: 10,
    points: ldOk ? 10 : ld.blocks ? 3 : 0, status: ldOk ? 'pass' : ld.blocks ? 'warn' : 'fail',
    message: ldOk ? `JSON-LD types: ${ld.types.join(', ')}${ld.invalid ? ` (${ld.invalid} invalid block)` : ''}`
      : ld.blocks ? `${ld.blocks} JSON-LD block(s), none valid with a @type` : 'No JSON-LD structured data',
    fix: ldOk ? null : 'Add schema.org JSON-LD (Organization / WebSite / Product …) in a <script type="application/ld+json">' });

  // 6. llms.txt (5)
  const llmsIsText = llms.ok && !/<html/i.test(llms.text.slice(0, 500));
  const llmsOk = llmsIsText && /^\s*# /.test(llms.text);
  add({ id: 'llms-txt', group: 'ai-summary', max: 5,
    points: llmsOk ? 5 : llmsIsText ? 2 : 0, status: llmsOk ? 'pass' : llmsIsText ? 'warn' : 'fail',
    message: llmsOk ? '/llms.txt present' : llmsIsText ? '/llms.txt exists but does not start with a "# " heading' : 'No /llms.txt (emerging convention; cheap to add)',
    fix: llmsOk ? null : 'Publish /llms.txt: a Markdown summary of the site starting with "# Site name"' });

  // 7. IndexNow (5) — not observable from outside unless the site is on Knownsite.
  add({ id: 'indexnow', group: 'notifications', max: 5, points: 0, status: 'unknown',
    message: "Can't tell from outside whether this site pings IndexNow on changes",
    fix: 'Ping IndexNow on every deploy (Bing, Yandex, Naver, Seznam, Yep): `knownsite notify` does this' });

  // 8. Knownsite Protocol (10)
  add({ id: 'knownsite', group: 'knownsite', max: 10,
    points: knownsite.level >= 2 ? 10 : knownsite.level >= 1 ? 5 : 0, status: knownsite.level >= 2 ? 'pass' : knownsite.level >= 1 ? 'warn' : 'fail',
    message: knownsite.level ? `Knownsite Level ${knownsite.level}` : 'No /.well-known/discovery.json',
    fix: knownsite.level >= 2 ? null : 'Run `npx knownsite init` and `knownsite build` after your build' });

  let score = checks.reduce((s, c) => s + c.points, 0);
  if (critical.length) score = Math.min(score, 40);
  const band = score >= 85 ? 'discoverable' : score >= 60 ? 'partly-visible' : 'mostly-invisible';
  const notes = [robotsNote, renderNote].filter(Boolean);
  if (finalUrl.href !== startUrl) notes.push(`${startUrl} redirects to ${finalUrl.href}`);

  return { url: finalUrl.href, scannedAt: new Date().toISOString(), version: CHECK_VERSION, score, band, critical, notes,
    rendering, checks, crawlers: crawlers.map(({ ua, ...c }) => c), training };
}

/** Fixes ordered by points recoverable. */
export function rankFixes(report) {
  return report.checks.filter((c) => c.fix)
    .map((c) => ({ ...c, gain: c.max - c.points }))
    .sort((a, b) => b.gain - a.gain);
}
