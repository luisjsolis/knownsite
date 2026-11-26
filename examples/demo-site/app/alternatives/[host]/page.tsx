import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMeta, SALES_EMAIL, SITE } from '../../meta';
import { findSite, aiSearchSummary, textSummary, fmtDate } from '../../sites/data';
import { data, hostOf, publishable, isChecked } from '../data';

// "Alternatives to X" pages: tools that do the same job, compared on facts from each company's own
// pages (data/alternatives.json, checked on the dates shown).

export const dynamicParams = false;
export const generateStaticParams = () => {
  const d = data();
  return d.pages.filter((p) => publishable(p, d)).map((p) => ({ host: p.host }));
};

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const d = data();
  const page = d.pages.find((p) => p.host === host);
  if (!page) return {};
  const p = d.products[host];
  const names = page.alternatives.filter((k) => isChecked(d.products[k])).map((k) => d.products[k].name);
  return pageMeta(`/alternatives/${host}`, `${p.name} alternatives`,
    `${names.slice(0, 3).join(', ')} and more compared with ${p.name}: prices and plans from each company's own pages, and which ones AI assistants name together.`);
}

const latest = (dates: (string | undefined)[]) => dates.filter(Boolean).sort().at(-1) ?? '';

export default async function Page({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const d = data();
  const page = d.pages.find((p) => p.host === host);
  if (!page || !publishable(page, d)) notFound();
  const subject = d.products[host];
  const cat = d.categories[subject.category];
  // Only tools with enough checked facts get a row; the rest are named below the table.
  const rows = [host, ...page.alternatives.filter((k) => isChecked(d.products[k]))];
  const notCompared = page.alternatives.filter((k) => !isChecked(d.products[k])).map((k) => d.products[k]?.name || hostOf(k, d));
  const checked = rows.map((h) => d.products[h]);
  const ours = rows.filter((h) => d.products[h].ours).map((h) => d.products[h].name);
  const co = page.coMentions;
  const crawl = rows.map((k) => ({ h: hostOf(k, d), f: findSite(hostOf(k, d)) })).filter((x) => x.f);
  const date = latest(checked.map((p) => p.checked));
  // Tools with their own alternatives page link to it: the pages form a web, like AlternativeTo's.
  const published = new Set(d.pages.filter((pg) => publishable(pg, d)).map((pg) => pg.host));

  return (
    <>
      <p className="eyebrow"><Link href="/sites">Directory</Link> · {cat.name}</p>
      <h1>{subject.name} alternatives</h1>
      <p className="lede">
        {subject.does?.startsWith(subject.name) ? subject.does : `${subject.name}: ${subject.does}`} Below are {rows.length - 1} tools that do the same job, compared on facts from each
        company&rsquo;s own pricing and home pages{date ? `, checked ${fmtDate(`${date}T20:00:00Z`)}` : ''}.
      </p>

      <h2>How they compare</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Tool</th>{cat.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((h) => {
              const p = d.products[h];
              return (
                <tr key={h}>
                  <td>
                    <strong>{h !== host && published.has(h) ? <Link href={`/alternatives/${h}`}>{p.name}</Link> : p.name}</strong>{h === host && <div className="muted small">the tool you asked about</div>}
                    {p.ours && <div className="muted small">Made by the Knownsite team</div>}
                    <div className="small"><a href={`https://${hostOf(h, d)}`} rel="nofollow noopener">{hostOf(h, d)}</a></div>
                  </td>
                  {p.unchecked
                    ? <td colSpan={cat.columns.length} className="muted">Not checked yet{p.uncheckedWhy ? `: ${p.uncheckedWhy}` : ''}.</td>
                    : p.cells!.map((c, i) => <td key={i}>{c}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notCompared.length > 0 && <p className="muted small">Also an alternative, not compared yet (its pages didn&rsquo;t give enough to check): {notCompared.join(', ')}.</p>}
      <p className="muted small">Published prices before coupons or sales. They change; check the source before buying.</p>

      {co && (
        <>
          <h2>Which ones AI assistants name together</h2>
          <p>
            We asked {co.engines} {co.asked / 3} buyer questions about {cat.name} ({co.asked} answers, {fmtDate(`${co.date}T20:00:00Z`)}).
            {' '}{co.named} answers named {subject.name}. In those answers, the others named alongside it:
          </p>
          <table>
            <tbody>
              {Object.entries(co.counts).sort((a, b) => b[1] - a[1]).map(([h, n]) => (
                <tr key={h}><td>{d.products[h].name}{d.products[h].ours ? <span className="muted small"> (ours)</span> : ''}</td><td>{n} of {co.named}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Answers vary from run to run; we re-ask the same questions every week.</p>
        </>
      )}

      {crawl.length > 0 && (
        <>
          <h2>Can AI crawlers read their sites?</h2>
          <table>
            <thead><tr><th>Site</th><th>AI search crawlers</th><th>Homepage text without JavaScript</th></tr></thead>
            <tbody>
              {crawl.map(({ h, f }) => (
                <tr key={h}><td><Link href={`/sites/${h}`}>{h}</Link></td><td>{aiSearchSummary(f!.site)}</td><td>{textSummary(f!.site)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">From each site&rsquo;s robots.txt and homepage, read by <Link href="/bot">KnownsiteBot</Link>. AI search crawlers: ChatGPT search, Claude and Perplexity.</p>
        </>
      )}

      <h2>Sources</h2>
      <ul className="small">
        {checked.flatMap((p) => (p.sources ?? []).map((u) => <li key={u}><a href={u} rel="nofollow noopener">{u}</a> ({p.name}, checked {fmtDate(`${p.checked}T20:00:00Z`)})</li>))}
      </ul>

      <div className="card">
        <p style={{ margin: 0 }}>
          Written by Knownsite.{ours.length ? ` ${ours.join(' and ')} ${ours.length > 1 ? 'are' : 'is'} made by the Knownsite team, listed under the same rules as the others.` : ''}
          {' '}No paid placement. Something wrong or out of date? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
        </p>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'ItemList', name: `${subject.name} alternatives`, url: `${SITE}/alternatives/${host}`,
        itemListElement: rows.slice(1).map((h, i) => ({ '@type': 'ListItem', position: i + 1, name: d.products[h].name, url: `https://${hostOf(h, d)}` })),
      }) }} />
    </>
  );
}
