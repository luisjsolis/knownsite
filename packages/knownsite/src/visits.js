// Crawler visits and AI-answer referrals, recorded at request time.
//
// Crawlers don't run JavaScript, so analytics scripts never see them; request-time code (a
// Next.js proxy, a server, an edge function) is the only place they show up. This module is
// framework-agnostic: it takes a standard Request (or anything with url, method, headers) and
// hands one event per interesting request to a sink you choose.
//
// "Verified" means the request came from the operator's published IP ranges. Anyone can put
// "OAI-SearchBot" in a User-Agent, so unverified events are claims, not visits. Operators that
// publish no list (Anthropic, Apple, DuckDuckGo) stay verified = null (can't tell).
//
// Privacy: referral events are people. They never carry an IP or a User-Agent, only the AI
// assistant they came from and the page. Crawler events keep the IP: it is the bot's, and it is
// what verification rests on.
import { BlockList, isIP } from 'node:net';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Order matters: first match wins (Google's other agents also contain "Googlebot").
export const BOTS = [
  { name: 'OAI-SearchBot', company: 'OpenAI', purpose: 'search', ips: 'https://openai.com/searchbot.json' },
  { name: 'ChatGPT-User', company: 'OpenAI', purpose: 'user', ips: 'https://openai.com/chatgpt-user.json' },
  { name: 'GPTBot', company: 'OpenAI', purpose: 'training', ips: 'https://openai.com/gptbot.json' },
  { name: 'Claude-SearchBot', company: 'Anthropic', purpose: 'search' },
  { name: 'Claude-User', company: 'Anthropic', purpose: 'user' },
  { name: 'ClaudeBot', company: 'Anthropic', purpose: 'training' },
  { name: 'PerplexityBot', company: 'Perplexity', purpose: 'search', ips: 'https://www.perplexity.ai/perplexitybot.json' },
  { name: 'Perplexity-User', company: 'Perplexity', purpose: 'user', ips: 'https://www.perplexity.ai/perplexity-user.json' },
  { name: 'Googlebot', company: 'Google', purpose: 'search', ips: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json' },
  { name: 'bingbot', company: 'Microsoft', purpose: 'search', ips: 'https://www.bing.com/toolbox/bingbot.json' },
  { name: 'Applebot', company: 'Apple', purpose: 'search' },
  { name: 'DuckAssistBot', company: 'DuckDuckGo', purpose: 'user' },
  { name: 'meta-externalagent', company: 'Meta', purpose: 'training' },
  { name: 'Amazonbot', company: 'Amazon', purpose: 'search' },
  { name: 'CCBot', company: 'Common Crawl', purpose: 'training' },
];

// People clicking through from an AI answer: Referer host, or ?utm_source= (ChatGPT adds
// utm_source=chatgpt.com to links it cites).
export const AI_REFERRERS = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini',
  'copilot.microsoft.com': 'Copilot',
};

const RANGES_TTL_MS = 24 * 3600_000;
const rangeCache = new Map();

function headerOf(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v ?? null;
}

function loadRanges(url, fetchImpl) {
  const hit = rangeCache.get(url);
  if (hit && Date.now() - hit.at < RANGES_TTL_MS) return hit.list;
  const list = fetchImpl(url, { signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j) => {
      const bl = new BlockList();
      for (const p of j.prefixes ?? []) {
        const cidr = p.ipv4Prefix ?? p.ipv6Prefix;
        if (!cidr) continue;
        const [addr, bits] = cidr.split('/');
        bl.addSubnet(addr, Number(bits), p.ipv4Prefix ? 'ipv4' : 'ipv6');
      }
      return bl;
    })
    .catch(() => {
      rangeCache.delete(url); // retry on the next visit instead of caching the failure
      return null;
    });
  rangeCache.set(url, { at: Date.now(), list });
  return list;
}

/** true/false if the operator publishes IP ranges and we could load them; null = can't tell. */
export async function verifyBotIp(bot, ip, fetchImpl = fetch) {
  if (!bot?.ips || !ip) return null;
  const family = isIP(ip);
  if (!family) return null;
  const bl = await loadRanges(bot.ips, fetchImpl);
  return bl ? bl.check(ip, family === 6 ? 'ipv6' : 'ipv4') : null;
}

/** Client IP from the usual proxy headers (Vercel sets x-real-ip; most CDNs x-forwarded-for). */
export function clientIp(headers) {
  return headerOf(headers, 'x-real-ip') ?? headerOf(headers, 'x-forwarded-for')?.split(',')[0].trim() ?? null;
}

function referrerName(host) {
  if (!host) return null;
  host = host.toLowerCase().replace(/^www\./, '');
  for (const [h, name] of Object.entries(AI_REFERRERS)) if (host === h || host.endsWith(`.${h}`)) return name;
  return null;
}

/**
 * Classify one request. Returns null for ordinary traffic, otherwise
 * { kind: 'crawler', bot } or { kind: 'referral', source }.
 */
export function classifyVisit({ url, method = 'GET', headers }) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  const ua = (headerOf(headers, 'user-agent') ?? '').toLowerCase();
  const bot = BOTS.find((b) => ua.includes(b.name.toLowerCase()));
  if (bot) return { kind: 'crawler', bot };
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const utm = u.searchParams.get('utm_source');
  let source = referrerName(utm);
  if (!source) {
    const ref = headerOf(headers, 'referer');
    try {
      source = ref ? referrerName(new URL(ref).hostname) : null;
    } catch {
      source = null;
    }
  }
  return source ? { kind: 'referral', source } : null;
}

/**
 * Build the event to store, or null. Field names match a simple SQL table
 * (at, kind, agent, company, purpose, path, verified, ip, user_agent).
 */
export async function visitEvent(request, { ip, now = new Date(), verify = true, fetchImpl = fetch } = {}) {
  const c = classifyVisit(request);
  if (!c) return null;
  const pathname = new URL(request.url).pathname.slice(0, 500);
  const at = now.toISOString();
  if (c.kind === 'referral') {
    return { at, kind: 'referral', agent: c.source, company: null, purpose: 'referral', path: pathname,
      verified: null, ip: null, user_agent: null };
  }
  const addr = ip ?? clientIp(request.headers);
  return {
    at, kind: 'crawler', agent: c.bot.name, company: c.bot.company, purpose: c.bot.purpose, path: pathname,
    verified: verify ? await verifyBotIp(c.bot, addr, fetchImpl) : null,
    ip: addr, user_agent: (headerOf(request.headers, 'user-agent') ?? '').slice(0, 500),
  };
}

/**
 * Record a request if it is a crawler visit or an AI referral. Never throws: logging must not
 * break a page. Returns a promise (hand it to waitUntil) or null when there is nothing to record.
 */
export function recordVisit(request, { sink = consoleSink(), ip, verify, fetchImpl } = {}) {
  if (!classifyVisit(request)) return null;
  return (async () => {
    try {
      const event = await visitEvent(request, { ip, verify, fetchImpl });
      if (event) await sink(event);
    } catch {
      // swallow: a logging failure must never surface to the visitor
    }
  })();
}

// ---- sinks: where events go. Any async function (event) => void works.

/** One JSON line per event on stdout (shows up in Vercel / Cloud Run / server logs). */
export function consoleSink(log = console.log) {
  return async (event) => log(JSON.stringify({ knownsite_visit: event }));
}

/** POST each event as JSON, e.g. to a Supabase table: httpSink(`${url}/rest/v1/visits`, { headers }). */
export function httpSink(url, { headers = {}, fetchImpl = fetch } = {}) {
  return async (event) => {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal', ...headers },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
  };
}

/** Append JSON lines to a file (a long-running Node server or local testing). */
export function fileSink(file) {
  return async (event) => {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(event)}\n`);
  };
}

/** Parse stored events: a JSON array, JSON lines, or log lines containing {"knownsite_visit": ...}. */
export function parseVisits(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  const out = [];
  for (const line of trimmed.split('\n')) {
    const i = line.indexOf('{');
    if (i < 0) continue;
    try {
      const obj = JSON.parse(line.slice(i));
      const ev = obj.knownsite_visit ?? obj;
      if (ev && ev.kind && ev.at) out.push(ev);
    } catch {
      // not an event line
    }
  }
  return out;
}
