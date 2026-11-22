// `knownsite report`: what changed on the site, when engines were told, when AI and search
// crawlers came back, and how many people arrived from AI answers since.
//
//   page changed (signed records: `modified`)  →  engines told (notify log)
//     →  crawlers re-read it (visit events)  →  visitors from AI answers (referral events)
//
// Inputs are plain data so the timeline can be computed anywhere (CLI, a dashboard, tests).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseVisits } from './visits.js';
import { parseRecords } from './build.js';

const DAY = 86_400_000;

// Crawlers worth showing in a timeline: the ones that put a page in search results or AI answers.
const WHO = {
  'OAI-SearchBot': 'ChatGPT search', 'ChatGPT-User': 'ChatGPT, for a user', GPTBot: 'OpenAI training',
  'Claude-SearchBot': 'Claude search', 'Claude-User': 'Claude, for a user', ClaudeBot: 'Anthropic training',
  PerplexityBot: 'Perplexity search', 'Perplexity-User': 'Perplexity, for a user',
  Googlebot: 'Google Search', bingbot: 'Bing (also ChatGPT search, Copilot)', Applebot: 'Apple (Siri, Spotlight)',
  DuckAssistBot: 'DuckDuckGo AI', 'meta-externalagent': 'Meta training', Amazonbot: 'Amazon (Alexa)',
  CCBot: 'Common Crawl (training)',
};

const pathOf = (url) => {
  try {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/$/, '') : '/';
  } catch {
    return url;
  }
};
const normPath = (p) => (p && p.length > 1 ? p.replace(/\/$/, '') : p || '/');
const t = (iso) => new Date(iso).getTime();

/**
 * @param {object} input
 * @param {string} input.site
 * @param {object[]} input.records        live signed records (url, title, modified)
 * @param {object[]} [input.notifications] notify log entries ({ at, changes, engines })
 * @param {object[]} [input.visits]        visit events (see visits.js)
 * @param {Date} [input.now]
 * @param {number} [input.days=30]
 */
export function buildReport({ site, records, notifications = [], visits = [], now = new Date(), days = 30, hasVisitSource = false }) {
  const until = now.getTime();
  const since = until - days * DAY;
  const inWindow = (iso) => t(iso) >= since && t(iso) <= until;
  // A crawler that is known to be spoofed (IP outside the operator's ranges) is not a visit.
  const real = visits.filter((v) => inWindow(v.at) && !(v.kind === 'crawler' && v.verified === false));
  const crawls = real.filter((v) => v.kind === 'crawler');
  const referrals = real.filter((v) => v.kind === 'referral');

  const byAgent = new Map();
  for (const v of crawls) {
    const a = byAgent.get(v.agent) ?? { agent: v.agent, who: WHO[v.agent] ?? v.company ?? '', purpose: v.purpose,
      visits: 0, verified: 0, lastAt: v.at };
    a.visits++;
    if (v.verified === true) a.verified++;
    if (t(v.at) > t(a.lastAt)) a.lastAt = v.at;
    byAgent.set(v.agent, a);
  }
  const bySource = new Map();
  for (const v of referrals) bySource.set(v.agent, (bySource.get(v.agent) ?? 0) + 1);

  const spoofed = visits.filter((v) => inWindow(v.at) && v.kind === 'crawler' && v.verified === false).length;

  const pages = records
    .filter((r) => r.modified && inWindow(r.modified))
    .sort((a, b) => t(b.modified) - t(a.modified))
    .map((r) => {
      const p = pathOf(r.url);
      const changedAt = t(r.modified);
      const run = notifications
        .filter((n) => t(n.at) >= changedAt - 60_000) // notify runs right after the deploy that changed it
        .filter((n) => [...(n.changes?.added ?? []), ...(n.changes?.updated ?? [])].some((u) => pathOf(u) === p))
        .sort((a, b) => t(a.at) - t(b.at))[0];
      // Experiment: a page the notify run deliberately held back was not announced.
      const heldBack = Boolean(run?.heldOut?.some((u) => pathOf(u) === p));
      const told = heldBack ? null : run;
      const firstByAgent = new Map();
      for (const v of crawls) {
        if (v.purpose === 'training' || normPath(v.path) !== p || t(v.at) < changedAt) continue;
        const prev = firstByAgent.get(v.agent);
        if (!prev || t(v.at) < t(prev.at)) firstByAgent.set(v.agent, v);
      }
      const after = referrals.filter((v) => normPath(v.path) === p && t(v.at) >= changedAt);
      const sources = {};
      for (const v of after) sources[v.agent] = (sources[v.agent] ?? 0) + 1;
      const added = run ? (run.changes?.added ?? []).some((u) => pathOf(u) === p) : false;
      return {
        url: r.url, path: p, title: r.title, changedAt: r.modified, change: added ? 'published' : 'changed',
        experiment: run?.heldOut ? (heldBack ? 'held-out' : 'announced') : null,
        notified: told ? { at: told.at, engines: (told.engines ?? []).filter((e) => e.ok).map((e) => ({ engine: e.engine, via: e.via })) } : null,
        recrawls: [...firstByAgent.values()]
          .sort((a, b) => t(a.at) - t(b.at))
          .map((v) => ({ agent: v.agent, who: WHO[v.agent] ?? v.company ?? '', at: v.at, verified: v.verified,
            hoursAfterChange: Math.round((t(v.at) - changedAt) / 3_600_000) })),
        referrals: { total: after.length, bySource: sources },
      };
    });

  const refByPath = new Map();
  for (const v of referrals) refByPath.set(normPath(v.path), (refByPath.get(normPath(v.path)) ?? 0) + 1);

  return {
    site,
    experiment: experimentSummary(pages, until),
    since: new Date(since).toISOString(),
    until: new Date(until).toISOString(),
    days,
    crawlers: [...byAgent.values()].sort((a, b) => b.visits - a.visits),
    spoofedCrawlerVisits: spoofed,
    referrals: { total: referrals.length, bySource: Object.fromEntries([...bySource].sort((a, b) => b[1] - a[1])) },
    topReferredPages: [...refByPath].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, visits]) => ({ path, visits })),
    pages,
    hasVisitData: hasVisitSource || visits.length > 0,
  };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Announced vs held-out pages (notify "holdout"): per crawler, how many pages it re-read, the median
 * hours from change to first visit, and the share re-read within 1, 3 and 7 days. Pages changed too
 * recently to have had 7 days are counted only in the windows they've had.
 */
export function experimentSummary(pages, until) {
  const groups = { announced: pages.filter((p) => p.experiment === 'announced'), 'held-out': pages.filter((p) => p.experiment === 'held-out') };
  if (!groups.announced.length || !groups['held-out'].length) return null;
  const agents = [...new Set(pages.flatMap((p) => p.recrawls.map((r) => r.agent)))].sort();
  const stats = (list, agent) => {
    const hours = list.map((p) => p.recrawls.find((r) => r.agent === agent)?.hoursAfterChange).filter((h) => h != null);
    const within = (d) => {
      const eligible = list.filter((p) => until - Date.parse(p.changedAt) >= d * DAY);
      if (!eligible.length) return null;
      const hit = eligible.filter((p) => { const h = p.recrawls.find((r) => r.agent === agent)?.hoursAfterChange; return h != null && h <= d * 24; });
      return Math.round((hit.length / eligible.length) * 100);
    };
    return { pages: list.length, reread: hours.length, medianHours: median(hours), within1d: within(1), within3d: within(3), within7d: within(7) };
  };
  return {
    announced: groups.announced.length,
    heldOut: groups['held-out'].length,
    byAgent: Object.fromEntries(agents.map((a) => [a, { announced: stats(groups.announced, a), heldOut: stats(groups['held-out'], a) }])),
  };
}

/** Plain-text rendering for the terminal. */
export function renderReport(r, { timeZone } = {}) {
  const day = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const sameDay = (a, b) => day(a) === day(b);
  const gap = (hours) => (hours < 1 ? 'within the hour' : hours < 48 ? `+${hours}h` : `+${Math.round(hours / 24)} days`);
  const out = [`knownsite report: ${r.site}  (last ${r.days} days)`, ''];

  if (!r.hasVisitData) {
    out.push('  No visit data. Add the crawler logger to see which AI and search crawlers read your pages',
      '  and how many people arrive from AI answers (Next.js: `knownsite/next`; see README), then',
      '  run `knownsite report --visits <file or URL>`.', '');
  } else {
    out.push('  AI & search crawlers                                   visits  verified  last seen');
    if (!r.crawlers.length) out.push('    none yet');
    for (const c of r.crawlers) {
      out.push(`    ${`${c.agent} (${c.who})`.padEnd(52)} ${String(c.visits).padStart(6)}  ${String(c.verified).padStart(8)}  ${day(c.lastAt)}`);
    }
    if (r.spoofedCrawlerVisits) out.push(`    (${r.spoofedCrawlerVisits} visits claimed to be a crawler but came from the wrong IPs; not counted)`);
    out.push('', `  Visitors from AI answers: ${r.referrals.total
      ? Object.entries(r.referrals.bySource).map(([s, n]) => `${s} ${n}`).join(', ')
      : 'none yet'}`);
    if (r.topReferredPages.length) {
      out.push(`    top pages: ${r.topReferredPages.slice(0, 5).map((p) => `${p.path} (${p.visits})`).join(', ')}`);
    }
    out.push('');
  }

  if (r.experiment) {
    const e = r.experiment;
    const pct = (v) => (v == null ? '  -' : `${String(v).padStart(3)}%`);
    const hrs = (v) => (v == null ? 'not yet' : v < 48 ? `${Math.round(v)}h` : `${Math.round(v / 24)}d`);
    out.push(`  Experiment: ${e.announced} pages announced vs ${e.heldOut} held back (not announced)`);
    out.push('    crawler            group       re-read  median   ≤1 day  ≤3 days  ≤7 days');
    for (const [agent, s] of Object.entries(e.byAgent)) {
      for (const [label, g] of [['announced', s.announced], ['held back', s.heldOut]]) {
        out.push(`    ${(label === 'announced' ? agent : '').padEnd(18)} ${label.padEnd(10)} ${`${g.reread}/${g.pages}`.padStart(7)}  ${hrs(g.medianHours).padStart(7)}  ${pct(g.within1d)}    ${pct(g.within3d)}     ${pct(g.within7d)}`);
      }
    }
    if (!Object.keys(e.byAgent).length) out.push('    no crawler has re-read any of these pages yet');
    out.push('');
  }

  out.push('  What changed, and what happened next');
  if (!r.pages.length) out.push(`    No page changed in the last ${r.days} days.`);
  // Pages changed in the same deploy share a timestamp. A big batch (first install, a redesign)
  // is one line, not one per page.
  const groups = [];
  for (const p of r.pages) {
    const g = groups.at(-1);
    if (g && g[0].changedAt === p.changedAt) g.push(p); else groups.push([p]);
  }
  const told = (n, changedAt) => {
    if (!n) return '      → engines not told (no `knownsite notify` run recorded for this change, or held back)';
    const engines = n.engines.map((e) => e.engine).join('; ') || 'nobody (no engine accepted)';
    return `      → told ${engines}  ${sameDay(n.at, changedAt) ? 'the same day' : day(n.at)}`;
  };
  const refs = (bySource) => Object.entries(bySource).map(([s, n]) => `${s} ${n}`).join(', ');
  let shown = 0;
  for (const g of groups) {
    if (shown >= 20) break;
    if (g.length > 5) {
      const published = g.filter((p) => p.change === 'published').length;
      const verb = published === g.length ? 'published' : published ? `changed or published (${published} new)` : 'changed';
      out.push(`    ${g.length} pages ${verb} ${day(g[0].changedAt)}  (one deploy)`);
      out.push(told(g.find((p) => p.notified)?.notified, g[0].changedAt));
      if (r.hasVisitData) {
        const agents = new Map();
        for (const p of g) for (const c of p.recrawls) {
          const a = agents.get(c.agent) ?? { pages: 0, first: c.at };
          a.pages++;
          if (c.at < a.first) a.first = c.at;
          agents.set(c.agent, a);
        }
        for (const [agent, a] of [...agents].sort((x, y) => (x[1].first < y[1].first ? -1 : 1))) {
          out.push(`      → ${agent} re-read ${a.pages} of ${g.length} pages, first ${day(a.first)}`);
        }
        if (!agents.size) out.push('      → no search or AI crawler has re-read them yet');
      }
      const total = g.reduce((n, p) => n + p.referrals.total, 0);
      if (total) {
        const by = {};
        for (const p of g) for (const [s, n] of Object.entries(p.referrals.bySource)) by[s] = (by[s] ?? 0) + n;
        out.push(`      → ${total} visitor${total === 1 ? '' : 's'} from AI answers since (${refs(by)})`);
      }
      shown++;
      continue;
    }
    for (const p of g) {
      out.push(`    ${p.path}  ${p.change} ${day(p.changedAt)}${p.experiment === 'held-out' ? '  (held back: experiment)' : ''}`);
      out.push(told(p.notified, p.changedAt));
      for (const c of p.recrawls) {
        out.push(`      → ${c.agent} re-read it  ${day(c.at)} (${gap(c.hoursAfterChange)})${c.verified === null ? ', unverified' : ''}`);
      }
      if (r.hasVisitData && !p.recrawls.length) out.push('      → no search or AI crawler has re-read it yet');
      if (p.referrals.total) {
        out.push(`      → ${p.referrals.total} visitor${p.referrals.total === 1 ? '' : 's'} from AI answers since (${refs(p.referrals.bySource)})`);
      }
      shown++;
    }
  }
  if (groups.length && shown >= 20 && r.pages.length > shown) out.push('    …more in --json');
  return out.join('\n');
}

/** Read visit events from a file path or an http(s) URL (JSON array, JSON lines, or log lines). */
export async function loadVisits(source, { headers = {}, fetchImpl = fetch } = {}) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetchImpl(source, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Could not read visits from ${source}: HTTP ${res.status}`);
    return parseVisits(await res.text());
  }
  return parseVisits(await readFile(source, 'utf8'));
}

/** Notify history, one JSON line per `knownsite notify` run; committed next to knownsite.config.json. */
export const HISTORY_FILE = 'knownsite.history.jsonl';

/**
 * Notify history for a project: knownsite.history.jsonl, plus .knownsite/report.json (the latest
 * run, which predates the history file on sites that installed 0.1.0). Deduplicated by deploy id.
 */
export async function loadNotifications(cwd) {
  const out = [];
  for (const file of [path.join(cwd, HISTORY_FILE), path.join(cwd, '.knownsite', 'notify-log.jsonl')]) {
    try {
      for (const n of parseRecords(await readFile(file, 'utf8'))) {
        if (!out.some((m) => m.deploy?.id && m.deploy.id === n.deploy?.id)) out.push(n);
      }
    } catch {
      // no history there
    }
  }
  try {
    const last = JSON.parse(await readFile(path.join(cwd, '.knownsite', 'report.json'), 'utf8'));
    if (last.engines?.length && !out.some((n) => n.deploy?.id && n.deploy.id === last.deploy?.id)) {
      out.push({ at: last.at ?? last.deploy?.at, deploy: last.deploy, changes: last.changes, engines: last.engines });
    }
  } catch {
    // no report yet
  }
  return out.filter((n) => n.at);
}
