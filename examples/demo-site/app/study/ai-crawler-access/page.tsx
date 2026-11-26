import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMeta, SALES_EMAIL } from '../../meta';
import { study, fmtDate, AI_SEARCH_BOTS, TRAINING_BOTS, SEARCH_BOTS, type Site } from '../../sites/data';

export const metadata = pageMeta('/study/ai-crawler-access', 'Which top websites block AI crawlers?',
  'Of the most-visited websites, how many block AI training crawlers, AI search crawlers and Google, and how many have llms.txt, measured from their robots.txt and homepages.');

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

/**
 * The numbers behind the page, over websites only: domains whose homepage answered with an HTML page
 * (or refused us with a bot challenge). Domains that disallow every crawler in robots.txt, Reddit
 * among them, can't be checked for a homepage without ignoring that rule, so they are counted apart.
 */
function studyStats(sites: Site[]) {
  const web = sites.filter((s) => s.website && s.robots);
  const read = web.filter((s) => !s.blocked && s.words != null);
  const blocks = (group: 'aiSearch' | 'training' | 'search', token: string) => web.filter((s) => s.robots![group][token] === false).length;
  const count = (map: (s: Site) => string | null | undefined, from: Site[]) => {
    const m = new Map<string, number>();
    for (const s of from) { const k = map(s); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const closed = sites.filter((s) => s.optedOut);
  return {
    domains: sites.length,
    websites: web.length,
    closed: closed.length,
    closedSites: closed.filter((s) => s.robots),
    notWebsites: sites.length - web.length - closed.length,
    training: TRAINING_BOTS.map(([t, who]) => ({ t, who, n: blocks('training', t) })),
    aiSearch: AI_SEARCH_BOTS.map(([t, who]) => ({ t, who, n: blocks('aiSearch', t) })),
    search: SEARCH_BOTS.map(([t, who]) => ({ t, who, n: blocks('search', t) })),
    trainingNotSearch: web.filter((s) => s.robots!.training.GPTBot === false && s.robots!.aiSearch['OAI-SearchBot'] === true).length,
    anyTraining: web.filter((s) => TRAINING_BOTS.some(([t]) => s.robots!.training[t] === false)).length,
    refused: web.filter((s) => s.blocked).length,
    read: read.length,
    thin: read.filter((s) => (s.words ?? 0) < 50).length,
    llms: web.filter((s) => s.llmsTxt).length,
    sitemap: web.filter((s) => s.sitemap?.found).length,
    hosts: count((s) => s.platform?.builder ?? s.platform?.host, web).slice(0, 8),
  };
}

export default function StudyPage() {
  const s = study();
  if (!s) notFound();
  const x = studyStats(s.sites);
  const top = s.sites.filter((v) => v.website && v.robots).slice(0, 100);
  const n = x.websites.toLocaleString('en-US');
  const botRow = (v: Site) => (
    <tr key={v.host}>
      <td>{v.rank}</td><td>{v.host}</td>
      <td>{cell(v.robots!.training.GPTBot)}</td><td>{cell(v.robots!.training.ClaudeBot)}</td><td>{cell(v.robots!.training['Google-Extended'])}</td>
      <td>{cell(v.robots!.aiSearch['OAI-SearchBot'])}</td><td>{cell(v.robots!.aiSearch['Claude-SearchBot'])}</td><td>{cell(v.robots!.aiSearch.PerplexityBot)}</td>
    </tr>
  );
  const botHead = <thead><tr><th>#</th><th>Site</th><th>GPTBot</th><th>ClaudeBot</th><th>Google-Extended</th><th>OAI-SearchBot</th><th>Claude-SearchBot</th><th>PerplexityBot</th></tr></thead>;
  const cell = (v: boolean | undefined) => (v === false ? <span className="bad">Blocked</span> : <span className="muted">Allowed</span>);
  return (
    <>
      <p className="eyebrow">Study · {fmtDate(s.generatedAt)}</p>
      <h1>Which of the top {n} websites block AI crawlers?</h1>
      <p className="lede">
        We read the robots.txt and homepage of the {n} most-visited websites, as <Link href="/bot">KnownsiteBot</Link>. They are the
        websites among the top {x.domains.toLocaleString('en-US')} domains on the {s.list}; the rest are CDNs, APIs, ad and tracking
        domains with no homepage, which we left out.
      </p>

      <div className="stats">
        <div className="stat"><div className="stat-label">Block GPTBot</div><div className="stat-value"><strong>{pct(x.training[0].n, x.websites)}</strong> (OpenAI training)</div></div>
        <div className="stat"><div className="stat-label">Block any training crawler</div><div className="stat-value"><strong>{pct(x.anyTraining, x.websites)}</strong></div></div>
        <div className="stat"><div className="stat-label">Block ChatGPT search</div><div className="stat-value"><strong>{pct(x.aiSearch[0].n, x.websites)}</strong> (OAI-SearchBot)</div></div>
        <div className="stat"><div className="stat-label">Have llms.txt</div><div className="stat-value"><strong>{pct(x.llms, x.websites)}</strong></div></div>
      </div>

      <h2>Training crawlers</h2>
      <table>
        <thead><tr><th>Crawler</th><th>Blocked by</th></tr></thead>
        <tbody>{x.training.map((r) => <tr key={r.t}><td><code>{r.t}</code> <span className="muted small">{r.who}</span></td><td>{pct(r.n, x.websites)} ({r.n})</td></tr>)}</tbody>
      </table>

      <h2>AI search crawlers and search engines</h2>
      <p>These fetch pages to answer a question or build search results. Blocking them keeps a site out of those answers.</p>
      <table>
        <thead><tr><th>Crawler</th><th>Blocked by</th></tr></thead>
        <tbody>{[...x.aiSearch, ...x.search].map((r) => <tr key={r.t}><td><code>{r.t}</code> <span className="muted small">{r.who}</span></td><td>{pct(r.n, x.websites)} ({r.n})</td></tr>)}</tbody>
      </table>
      <p>
        <strong>{pct(x.trainingNotSearch, x.websites)}</strong> block OpenAI&rsquo;s training crawler but still let ChatGPT search in:
        out of the training data, but still citable in answers.
      </p>

      <h2>What crawlers can read</h2>
      <ul>
        <li>{pct(x.refused, x.websites)} refused our crawler outright (a bot challenge or HTTP 403), so a new or small AI crawler would be refused too.</li>
        <li>Of the {x.read.toLocaleString('en-US')} we could read, {pct(x.thin, x.read)} had fewer than 50 words of text before JavaScript runs: crawlers that don&rsquo;t run JavaScript see a nearly empty page.</li>
        <li>{pct(x.sitemap, x.websites)} have a sitemap at the address robots.txt gives (or /sitemap.xml); {pct(x.llms, x.websites)} have an llms.txt.</li>
        {x.hosts.length > 0 && <li>Most common detected platforms: {x.hosts.map(([k, n]) => `${k} (${n})`).join(', ')}.</li>}
      </ul>

      <h2>Sites that only let in crawlers they name</h2>
      <p>
        {x.closed} of the top {x.domains.toLocaleString('en-US')} domains disallow every crawler in robots.txt except the ones they list by
        name, so a new crawler (ours included) is turned away by default. We didn&rsquo;t fetch their homepages, so they aren&rsquo;t in the
        shares above. What their robots.txt says about AI crawlers:
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="small">{botHead}<tbody>{x.closedSites.map(botRow)}</tbody></table>
      </div>

      <h2>The top 100</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="small">{botHead}<tbody>{top.map(botRow)}</tbody></table>
      </div>

      <h2>How this was measured</h2>
      <ul>
        <li>The list: {s.list}. Of its top {x.domains.toLocaleString('en-US')} domains, {x.websites.toLocaleString('en-US')} serve a website (an HTML homepage, or a bot challenge in front of one) and are counted; {x.notWebsites.toLocaleString('en-US')} don&rsquo;t (no address, an error, or an API or file host). The # column is the Tranco rank.</li>
        <li>&ldquo;Blocked&rdquo; means the robots.txt rules for that crawler (or for all crawlers) disallow the homepage. A site with no robots.txt allows everything.</li>
        <li>robots.txt is a request, not a lock: it shows what a site asks for, not what crawlers do. Some sites also block crawlers at the firewall, which robots.txt doesn&rsquo;t show.</li>
        <li>Domains whose robots.txt turns away unlisted crawlers are shown in their own table, from robots.txt only. Corrections: <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.</li>
      </ul>
      <p className="muted small">See any site&rsquo;s full results with the <Link href="/check">free check</Link>, or browse the <Link href="/sites">directory</Link>.</p>
    </>
  );
}
