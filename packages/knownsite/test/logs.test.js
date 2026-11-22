import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLogLine, visitsFromLogs } from '../src/logs.js';

const OAI = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot';
const ranges = async () => new Response(JSON.stringify({ prefixes: [{ ipv4Prefix: '20.42.10.0/24' }] }));

test('parseLogLine reads Cloud Logging, Vercel, Cloudflare and combined formats', () => {
  const gcp = parseLogLine(JSON.stringify({ timestamp: '2026-11-20T10:00:00.123Z', httpRequest: {
    requestMethod: 'GET', requestUrl: 'https://a.test/pricing?x=1', userAgent: OAI, remoteIp: '20.42.10.7', referer: '' } }));
  assert.deepEqual({ ...gcp, at: gcp.at.toISOString() }, { at: '2026-11-20T10:00:00.123Z', method: 'GET', path: '/pricing?x=1',
    host: 'a.test', userAgent: OAI, referer: '', ip: '20.42.10.7' });

  const vercel = parseLogLine(JSON.stringify({ timestamp: 1763632800000, proxy: { timestamp: 1763632800000, method: 'GET',
    path: '/blog', host: 'a.test', userAgent: ['Mozilla/5.0 (compatible; bingbot/2.0)'], clientIp: '40.77.167.1', referer: '' } }));
  assert.equal(vercel.path, '/blog');
  assert.equal(vercel.userAgent, 'Mozilla/5.0 (compatible; bingbot/2.0)');
  assert.equal(vercel.at.toISOString(), '2025-11-20T10:00:00.000Z');

  const cf = parseLogLine(JSON.stringify({ EdgeStartTimestamp: 1763632800000000000, ClientRequestMethod: 'GET',
    ClientRequestURI: '/?utm_source=chatgpt.com', ClientRequestHost: 'a.test', ClientRequestUserAgent: 'Mozilla/5.0 iPhone',
    ClientIP: '9.9.9.9', ClientRequestReferer: '' }));
  assert.equal(cf.path, '/?utm_source=chatgpt.com');
  assert.equal(cf.at.toISOString(), '2025-11-20T10:00:00.000Z');

  const nginx = parseLogLine(`66.249.66.1 - - [20/Nov/2026:05:00:00 -0500] "GET /about HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"`);
  assert.equal(nginx.at.toISOString(), '2026-11-20T10:00:00.000Z');
  assert.equal(nginx.path, '/about');
  assert.equal(nginx.referer, '');
  assert.equal(nginx.ip, '66.249.66.1');

  assert.equal(parseLogLine('not a log line'), null);
  assert.equal(parseLogLine('{"something":"else"}'), null);
});

test('visitsFromLogs: crawlers (verified) and AI referrals; other hosts, assets and people dropped', async () => {
  const line = (path, ua, { host = 'a.test', ip = '20.42.10.7', referer = '' } = {}) => JSON.stringify({ timestamp: '2026-11-20T10:00:00Z',
    httpRequest: { requestMethod: 'GET', requestUrl: `https://${host}${path}`, userAgent: ua, remoteIp: ip, referer } });
  const text = [
    line('/pricing', OAI),
    line('/pricing', OAI, { ip: '1.2.3.4' }), // spoof
    line('/_next/static/app.js', OAI), // asset
    line('/pricing', OAI, { host: 'other.test' }), // other host
    line('/pricing', 'Mozilla/5.0 iPhone', { referer: 'https://chatgpt.com/' }), // person from ChatGPT
    line('/pricing', 'Mozilla/5.0 iPhone', { referer: 'https://www.google.com/' }), // ordinary visitor
    line('/.well-known/discovery.json', OAI), // not an asset
    'garbage',
  ].join('\n');
  const { events, lines, parsed } = await visitsFromLogs(text, { site: 'https://a.test', fetchImpl: ranges });
  assert.equal(lines, 8);
  assert.equal(parsed, 7);
  assert.deepEqual(events.map((e) => [e.kind, e.agent, e.path, e.verified]), [
    ['crawler', 'OAI-SearchBot', '/pricing', true],
    ['crawler', 'OAI-SearchBot', '/pricing', false],
    ['referral', 'ChatGPT', '/pricing', null],
    ['crawler', 'OAI-SearchBot', '/.well-known/discovery.json', true],
  ]);
  assert.equal(events[0].at, '2026-11-20T10:00:00.000Z');
  assert.equal(events[2].ip, null, 'people: no IP');
});
