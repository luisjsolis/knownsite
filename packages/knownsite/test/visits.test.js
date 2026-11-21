import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyVisit, visitEvent, recordVisit, parseVisits, consoleSink } from '../src/visits.js';
import { knownsiteVisits } from '../src/next.js';
import { buildReport, renderReport } from '../src/report.js';

const req = (url, headers = {}, method = 'GET') => new Request(url, { method, headers });
const OAI = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot';
const ranges = async () => new Response(JSON.stringify({ prefixes: [{ ipv4Prefix: '20.42.10.0/24' }, { ipv6Prefix: '2600:1f28::/32' }] }));

test('classifyVisit: crawlers by User-Agent, AI referrals by Referer or utm_source, everything else null', () => {
  assert.equal(classifyVisit(req('https://a.test/x', { 'user-agent': OAI })).bot.name, 'OAI-SearchBot');
  assert.equal(classifyVisit(req('https://a.test/x', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).bot.company, 'Google');
  assert.equal(classifyVisit(req('https://a.test/x', { referer: 'https://chatgpt.com/' })).source, 'ChatGPT');
  assert.equal(classifyVisit(req('https://a.test/x', { referer: 'https://www.perplexity.ai/search?q=1' })).source, 'Perplexity');
  assert.equal(classifyVisit(req('https://a.test/x?utm_source=chatgpt.com')).source, 'ChatGPT');
  assert.equal(classifyVisit(req('https://a.test/x', { referer: 'https://www.google.com/' })), null);
  assert.equal(classifyVisit(req('https://a.test/x', { 'user-agent': 'Mozilla/5.0 Safari' })), null);
  assert.equal(classifyVisit(req('https://a.test/x', { 'user-agent': OAI }, 'POST')), null);
  // plain objects work too (Express, Node http)
  assert.equal(classifyVisit({ url: 'https://a.test/', headers: { 'user-agent': 'ClaudeBot/1.0' } }).bot.purpose, 'training');
});

test('visitEvent: crawler IPs verified against published ranges; spoofs come out verified=false', async () => {
  const good = await visitEvent(req('https://a.test/pricing', { 'user-agent': OAI, 'x-forwarded-for': '20.42.10.7, 10.0.0.1' }), { fetchImpl: ranges });
  assert.deepEqual({ ...good, at: undefined }, { at: undefined, kind: 'crawler', agent: 'OAI-SearchBot', company: 'OpenAI',
    purpose: 'search', path: '/pricing', verified: true, ip: '20.42.10.7', user_agent: OAI });
  const fake = await visitEvent(req('https://a.test/', { 'user-agent': OAI, 'x-real-ip': '1.2.3.4' }), { fetchImpl: ranges });
  assert.equal(fake.verified, false);
  const claude = await visitEvent(req('https://a.test/', { 'user-agent': 'Claude-SearchBot/1.0', 'x-real-ip': '1.2.3.4' }), { fetchImpl: ranges });
  assert.equal(claude.verified, null, 'Anthropic publishes no ranges: unknown, not false');
});

test('visitEvent: referral events are people, so no IP and no User-Agent', async () => {
  const ev = await visitEvent(req('https://a.test/pricing?utm_source=chatgpt.com', { 'user-agent': 'Mozilla/5.0 iPhone', 'x-real-ip': '9.9.9.9' }));
  assert.equal(ev.kind, 'referral');
  assert.equal(ev.agent, 'ChatGPT');
  assert.equal(ev.ip, null);
  assert.equal(ev.user_agent, null);
  assert.equal(ev.path, '/pricing');
});

test('recordVisit: null for ordinary traffic; a failing sink never throws', async () => {
  assert.equal(recordVisit(req('https://a.test/', { 'user-agent': 'Mozilla/5.0' })), null);
  const p = recordVisit(req('https://a.test/', { referer: 'https://claude.ai/' }), { sink: async () => { throw new Error('db down'); } });
  await assert.doesNotReject(p);
});

test('knownsiteVisits (Next.js): hands the work to event.waitUntil, skips outside production', async () => {
  const lines = [];
  const pending = [];
  const event = { waitUntil: (p) => pending.push(p) };
  const prev = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'preview';
    knownsiteVisits({ sink: consoleSink((l) => lines.push(l)) })(req('https://a.test/', { referer: 'https://chatgpt.com/' }), event);
    assert.equal(pending.length, 0);
    process.env.VERCEL_ENV = 'production';
    knownsiteVisits({ sink: consoleSink((l) => lines.push(l)) })(req('https://a.test/', { referer: 'https://chatgpt.com/' }), event);
    await Promise.all(pending);
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prev;
  }
  assert.equal(lines.length, 1);
  assert.equal(parseVisits(lines.join('\n'))[0].agent, 'ChatGPT');
});

test('parseVisits reads JSON arrays, JSON lines and log lines with a prefix', () => {
  const ev = { at: '2026-11-20T00:00:00Z', kind: 'referral', agent: 'ChatGPT', path: '/' };
  assert.equal(parseVisits(JSON.stringify([ev])).length, 1);
  assert.equal(parseVisits(`${JSON.stringify(ev)}\n${JSON.stringify(ev)}\n`).length, 2);
  assert.equal(parseVisits(`2026-11-20 INFO ${JSON.stringify({ knownsite_visit: ev })}\nnoise line\n`).length, 1);
});

test('buildReport: change → notified → recrawled → referrals, spoofed crawlers excluded', () => {
  const site = 'https://a.test';
  const records = [
    { url: `${site}/pricing`, title: 'Pricing', modified: '2026-11-17T15:00:00Z' },
    { url: `${site}/`, title: 'Home', modified: '2026-09-01T00:00:00Z' }, // outside the 30-day window
  ];
  const notifications = [{ at: '2026-11-17T15:02:00Z', changes: { added: [], updated: [`${site}/pricing`], removed: [] },
    engines: [{ engine: 'Bing, Yandex, Naver, Seznam, Yep', via: 'IndexNow', ok: true }, { engine: 'Google', via: 'sitemap', ok: null }] }];
  const c = (agent, at, verified = true, path = '/pricing', purpose = 'search') => ({ at, kind: 'crawler', agent, purpose, path, verified });
  const visits = [
    c('OAI-SearchBot', '2026-11-16T10:00:00Z'), // before the change: not a re-read
    c('OAI-SearchBot', '2026-11-18T09:00:00Z'),
    c('OAI-SearchBot', '2026-11-19T09:00:00Z'),
    c('bingbot', '2026-11-17T20:00:00Z'),
    c('GPTBot', '2026-11-18T01:00:00Z', true, '/pricing', 'training'), // training: counted, not in the timeline
    c('PerplexityBot', '2026-11-18T02:00:00Z', false), // spoofed
    ...Array.from({ length: 40 }, (_, i) => ({ at: `2026-11-20T${String(i % 24).padStart(2, '0')}:00:00Z`, kind: 'referral', agent: 'ChatGPT', path: '/pricing/' })),
    { at: '2026-11-15T00:00:00Z', kind: 'referral', agent: 'Perplexity', path: '/pricing' }, // before the change
  ];
  const r = buildReport({ site, records, notifications, visits, now: new Date('2026-11-21T00:00:00Z') });
  assert.equal(r.pages.length, 1);
  const p = r.pages[0];
  assert.equal(p.path, '/pricing');
  assert.equal(p.notified.at, '2026-11-17T15:02:00Z');
  assert.deepEqual(p.notified.engines.map((e) => e.via), ['IndexNow']);
  assert.deepEqual(p.recrawls.map((x) => [x.agent, x.hoursAfterChange]), [['bingbot', 5], ['OAI-SearchBot', 18]]);
  assert.deepEqual(p.referrals, { total: 40, bySource: { ChatGPT: 40 } });
  assert.equal(r.spoofedCrawlerVisits, 1);
  assert.equal(r.crawlers.find((x) => x.agent === 'OAI-SearchBot').visits, 3);
  assert.equal(r.crawlers.find((x) => x.agent === 'PerplexityBot'), undefined);
  assert.deepEqual(r.referrals, { total: 41, bySource: { ChatGPT: 40, Perplexity: 1 } });

  const text = renderReport(r, { timeZone: 'UTC' });
  assert.match(text, /\/pricing {2}changed Tue, Nov 17/);
  assert.match(text, /→ told Bing, Yandex, Naver, Seznam, Yep {2}the same day/);
  assert.match(text, /→ bingbot re-read it {2}Tue, Nov 17 \(\+5h\)/);
  assert.match(text, /→ OAI-SearchBot re-read it {2}Wed, Nov 18 \(\+18h\)/);
  assert.match(text, /→ 40 visitors from AI answers since \(ChatGPT 40\)/);
  assert.match(text, /1 visits claimed to be a crawler but came from the wrong IPs/);
});

test('buildReport without visit data still shows changes and explains how to add visits', () => {
  const r = buildReport({ site: 'https://a.test', records: [{ url: 'https://a.test/', modified: '2026-11-20T00:00:00Z' }],
    now: new Date('2026-11-21T00:00:00Z') });
  assert.equal(r.hasVisitData, false);
  const text = renderReport(r, { timeZone: 'UTC' });
  assert.match(text, /No visit data/);
  assert.match(text, /engines not told/);
});
