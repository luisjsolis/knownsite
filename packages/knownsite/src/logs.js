// Visits from hosting access logs, for sites with no request-time code (static hosting).
// Each log line becomes a request and goes through the same classifier and IP verification as the
// live logger (visits.js), so `knownsite report --logs` and `--visits` produce the same events.
//
// Formats, detected per line:
//   - Google Cloud Logging JSON (Firebase Hosting, Cloud Run, load balancers): httpRequest {...}
//   - Vercel log drains (JSON): proxy { path, userAgent, clientIp, referer, method, host }
//   - Cloudflare Logpush (JSON): ClientRequestPath/URI, ClientRequestUserAgent, ClientIP, ...
//   - Combined Log Format (nginx, Apache, Caddy in "combined" mode)
import { visitEvent } from './visits.js';

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const COMBINED = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "(\S+) (\S+)[^"]*" \d{3} \S+ "([^"]*)" "([^"]*)"/;

const first = (v) => (Array.isArray(v) ? v[0] : v) ?? null;

function toDate(v) {
  if (v == null) return null;
  if (typeof v === 'number') return new Date(v > 1e14 ? v / 1e6 : v > 1e11 ? v : v * 1000); // ns, ms or s
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * One log line -> { at: Date, method, path (may include ?query), host, userAgent, referer, ip } or null.
 */
export function parseLogLine(line) {
  const s = line.trim();
  if (!s) return null;
  if (s.startsWith('{')) {
    let j;
    try {
      j = JSON.parse(s);
    } catch {
      return null;
    }
    if (j.httpRequest) {
      const h = j.httpRequest;
      let u;
      try {
        u = new URL(h.requestUrl);
      } catch {
        return null;
      }
      return { at: toDate(j.timestamp ?? j.receiveTimestamp), method: h.requestMethod ?? 'GET', path: u.pathname + u.search,
        host: u.host, userAgent: h.userAgent ?? '', referer: h.referer ?? '', ip: h.remoteIp ?? null };
    }
    if (j.proxy) {
      const p = j.proxy;
      return { at: toDate(p.timestamp ?? j.timestamp), method: p.method ?? 'GET', path: p.path ?? '/', host: p.host ?? null,
        userAgent: first(p.userAgent) ?? '', referer: p.referer ?? '', ip: p.clientIp ?? null };
    }
    if (j.ClientRequestPath || j.ClientRequestURI) {
      return { at: toDate(j.EdgeStartTimestamp), method: j.ClientRequestMethod ?? 'GET',
        path: j.ClientRequestURI ?? j.ClientRequestPath, host: j.ClientRequestHost ?? null,
        userAgent: j.ClientRequestUserAgent ?? '', referer: j.ClientRequestReferer ?? '', ip: j.ClientIP ?? null };
    }
    return null;
  }
  const m = COMBINED.exec(s);
  if (!m) return null;
  const [, ip, dd, mon, yyyy, hh, mi, ss, tz, method, path, referer, userAgent] = m;
  const offsetMin = (tz[0] === '-' ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3)));
  const at = new Date(Date.UTC(Number(yyyy), MONTHS[mon], Number(dd), Number(hh), Number(mi), Number(ss)) - offsetMin * 60_000);
  return { at, method, path, host: null, userAgent, referer: referer === '-' ? '' : referer, ip };
}

// Assets aren't pages: a crawler fetching /_next/static/x.js is noise in a discovery report.
const ASSET = /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|json)$/i;
const isAsset = (path) => ASSET.test(path.split('?')[0]) && !/^\/\.well-known\//.test(path);

/**
 * Turn access-log text into visit events (crawlers + AI referrals). Lines for other hosts, assets
 * and ordinary visitors are dropped.
 * @param {string} text
 * @param {object} opts
 * @param {string} opts.site      https://example.com, used for host filtering and URLs
 * @param {boolean} [opts.verify=true]
 */
/** One entry per line; a JSON array (e.g. `gcloud logging read --format json` without jq) is split into entries. */
function logLines(text) {
  const t = text.trimStart();
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.map((e) => JSON.stringify(e));
    } catch {
      // not one JSON array: fall through to lines
    }
  }
  return text.split('\n');
}

export async function visitsFromLogs(text, { site, verify = true, fetchImpl = fetch } = {}) {
  const host = new URL(site).host;
  const events = [];
  let lines = 0;
  let parsed = 0;
  for (const line of logLines(text)) {
    if (!line.trim()) continue;
    lines++;
    const r = parseLogLine(line);
    if (!r || !r.at) continue;
    parsed++;
    if (r.host && r.host !== host) continue;
    if (isAsset(r.path)) continue;
    const request = { url: new URL(r.path, site).href, method: r.method,
      headers: { 'user-agent': r.userAgent, referer: r.referer } };
    const ev = await visitEvent(request, { ip: r.ip, now: r.at, verify, fetchImpl });
    if (ev) events.push(ev);
  }
  return { events, lines, parsed };
}
