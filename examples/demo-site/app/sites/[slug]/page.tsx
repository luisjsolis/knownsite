import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMeta, SALES_EMAIL } from '../../meta';
import { data as altData, publishedPages, hostOf, isChecked } from '../../alternatives/data';
import {
  directory, listed, findSite, allHosts, fmtDate, aiSearchSummary, textSummary, platformLine,
  AI_SEARCH_BOTS, SEARCH_BOTS, TRAINING_BOTS, type Category, type Site,
} from '../data';

// One route for both kinds of page: /sites/<category> and /sites/<host> (hosts contain a dot).
export const dynamicParams = false;

export function generateStaticParams() {
  const cats = directory().categories;
  return [...cats.map((c) => ({ slug: c.slug })), ...allHosts().map((h) => ({ slug: h }))];
}

const category = (slug: string) => directory().categories.find((c) => c.slug === slug) ?? null;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = category(slug);
  if (c) return pageMeta(`/sites/${slug}`, `${c.name}: what AI crawlers can read`, `${c.description} What each site lets AI search engines and training crawlers read, measured from its public files.`);
  const f = findSite(slug);
  if (f) return pageMeta(`/sites/${slug}`, `${slug}: AI crawler access`, `Which AI search engines and training crawlers ${slug} lets in, and what they can read, measured ${fmtDate(f.site.checkedAt)}.`);
  return {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = category(slug);
  if (c) return <CategoryPage c={c} />;
  const f = findSite(slug);
  if (f) return <SitePage site={f.site} categories={f.categories} />;
  notFound();
}

const yes = (ok: boolean | null | undefined, y = 'Yes', n = 'No') => (ok == null ? '–' : <span className={ok ? 'ok' : 'bad'}>{ok ? y : n}</span>);

function CategoryPage({ c }: { c: Category }) {
  const sites = listed(c);
  return (
    <>
      <p className="eyebrow"><Link href="/sites">Directory</Link> · {c.name}</p>
      <h1>{c.name}</h1>
      <p className="lede">{c.description} {sites.length} sites, in alphabetical order.</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Site</th><th>AI search crawlers</th><th>Text without JavaScript</th><th>Sitemap</th><th>llms.txt</th></tr></thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.host}>
                <td><Link href={`/sites/${s.host}`}>{s.name ?? s.host}</Link>{s.name && <div className="muted small">{s.host}</div>}{s.ours && <div className="muted small">Made by the Knownsite team</div>}</td>
                <td>{aiSearchSummary(s)}</td>
                <td>{s.blocked ? <span className="muted">Not measured</span> : textSummary(s)}</td>
                <td>{yes(s.sitemap?.found)}</td>
                <td>{yes(s.llmsTxt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Measured {fmtDate(sites[0]?.checkedAt ?? '')} by <Link href="/bot">KnownsiteBot</Link> from each site&rsquo;s robots.txt, homepage,
        sitemap and llms.txt. AI search crawlers: ChatGPT search, Claude and Perplexity. Being listed doesn&rsquo;t mean a site uses or
        endorses Knownsite. Missing a site? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
      </p>
    </>
  );
}

function BotTable({ title, bots, allow }: { title: string; bots: [string, string][]; allow: Record<string, boolean> }) {
  return (
    <>
      <h2>{title}</h2>
      <table>
        <tbody>
          {bots.map(([token, who]) => (
            <tr key={token}><td><code>{token}</code> <span className="muted small">{who}</span></td><td>{yes(allow[token], 'Allowed', 'Blocked')}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SitePage({ site: s, categories }: { site: Site; categories: Category[] }) {
  const others = [...new Map(categories.flatMap((c) => listed(c)).filter((o) => o.host !== s.host).map((o) => [o.host, o])).values()];
  const platform = platformLine(s.platform);
  // The alternatives pages this site appears on, and its own if it has one: the web of links.
  const alt = altData();
  const pages = publishedPages(alt);
  const keysHere = Object.entries(alt.products).filter(([k, p]) => hostOf(k, alt) === s.host).map(([k]) => k);
  const ownPages = pages.filter((p) => keysHere.includes(p.host));
  const listedOn = pages.filter((p) => !keysHere.includes(p.host) && p.alternatives.some((k) => keysHere.includes(k) && isChecked(alt.products[k])));
  return (
    <>
      <p className="eyebrow"><Link href="/sites">Directory</Link> · {categories.map((c, i) => <span key={c.slug}>{i ? ', ' : ''}<Link href={`/sites/${c.slug}`}>{c.name}</Link></span>)}</p>
      <h1>{s.name ?? s.host}</h1>
      {s.name && <p className="muted" style={{ marginTop: -8 }}>{s.host}</p>}
      {s.products && <p className="muted" style={{ marginTop: -8 }}>Products listed here: {s.products.join(', ')}</p>}
      {s.title && <p className="lede">{s.title}</p>}
      {s.description && <p>&ldquo;{s.description}&rdquo; <span className="muted small">(the site&rsquo;s own description)</span></p>}
      <p className="muted small">
        {s.ours ? 'Made by the Knownsite team. ' : ''}
        {(s.knownsiteLevel ?? 0) >= 2 ? 'Publishes signed Knownsite records. ' : 'Not claimed. '}
        Measured {fmtDate(s.checkedAt)} by <Link href="/bot">KnownsiteBot</Link>. Facts only; not an endorsement.
      </p>

      <div className="stats">
        <div className="stat"><div className="stat-label">AI search</div><div className="stat-value">{aiSearchSummary(s)}</div></div>
        <div className="stat"><div className="stat-label">Text without JS</div><div className="stat-value">{textSummary(s)}</div></div>
        <div className="stat"><div className="stat-label">Sitemap</div><div className="stat-value">{s.sitemap?.found ? `Yes, ${s.sitemap.entries.toLocaleString('en-US')} entries` : 'Not found'}</div></div>
        <div className="stat"><div className="stat-label">llms.txt</div><div className="stat-value">{s.llmsTxt ? 'Yes' : 'No'}</div></div>
      </div>

      {s.robots ? (
        <>
          {!s.robots.found && <p className="muted" style={{ marginTop: 24 }}>No robots.txt found, so every crawler is allowed.</p>}
          <BotTable title="AI search crawlers" bots={AI_SEARCH_BOTS} allow={s.robots.aiSearch} />
          <BotTable title="Search engines" bots={SEARCH_BOTS} allow={s.robots.search} />
          <BotTable title="AI training crawlers" bots={TRAINING_BOTS} allow={s.robots.training} />
          <p className="muted small">From the homepage rules in robots.txt. Blocking training crawlers is the site owner&rsquo;s choice; it doesn&rsquo;t stop AI search from citing the site.</p>
        </>
      ) : <p className="muted">robots.txt could not be read.</p>}

      <h2>Other details</h2>
      <ul>
        <li>Structured data (JSON-LD) on the homepage: {s.jsonLd == null ? 'not measured' : s.jsonLd ? 'yes' : 'no'}</li>
        {s.noindex && <li>The homepage asks search engines not to index it (noindex).</li>}
        {platform && <li>Detected: {platform}.</li>}
      </ul>

      {(ownPages.length > 0 || listedOn.length > 0) && (
        <>
          <h2>Compared with other tools</h2>
          <ul>
            {ownPages.map((p) => <li key={p.host}><Link href={`/alternatives/${p.host}`}>{alt.products[p.host].name} alternatives</Link></li>)}
            {listedOn.map((p) => <li key={p.host}>Listed on <Link href={`/alternatives/${p.host}`}>{alt.products[p.host].name} alternatives</Link></li>)}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <h2>Similar sites</h2>
          <p>{others.map((o, i) => <span key={o.host}>{i ? ' · ' : ''}<Link href={`/sites/${o.host}`}>{o.name ?? o.host}</Link></span>)}</p>
        </>
      )}

      <div className="card">
        <p style={{ margin: 0 }}>
          <strong>Is this your site?</strong> <Link href={`/check?url=${encodeURIComponent(s.url ?? `https://${s.host}`)}`}>Run the full check</Link> for
          a score and fixes, or install Knownsite to claim this page. To correct or remove it, email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
        </p>
      </div>
    </>
  );
}
