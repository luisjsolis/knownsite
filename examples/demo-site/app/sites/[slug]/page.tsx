import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMeta, SALES_EMAIL } from '../../meta';
import { data as altData, publishedPages, hostOf, isChecked } from '../../alternatives/data';
import {
  directory, listed, findSite, allHosts, fmtDate, aiSearchSummary, textSummary, platformLine,
  verdict, plainFacts, assistantsAllowed, homepageReadable,
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
  if (c) return pageMeta(`/sites/${slug}`, `${c.name}: which sites can AI assistants read?`, `${c.description} Which of these sites ChatGPT, Claude and Perplexity can read, and so recommend, checked ${fmtDate(c.sites[0]?.checkedAt ?? '')}.`);
  const f = findSite(slug);
  if (f) {
    const name = f.site.name ?? slug;
    return pageMeta(`/sites/${slug}`, `Can AI assistants read ${name}?`, `${verdict(f.site).headline}: what ChatGPT, Claude, Perplexity and search engines can read on ${slug}, checked ${fmtDate(f.site.checkedAt)}.`);
  }
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
  const alt = altData();
  const comparisons = publishedPages(alt).filter((p) => alt.products[p.host]?.category === c.slug);
  return (
    <>
      <p className="eyebrow"><Link href="/sites">Directory</Link> · {c.name}</p>
      <h1>{c.name}</h1>
      <p className="lede">
        {c.description} Which of these sites can AI assistants read? When someone asks ChatGPT, Claude or Perplexity for a tool like these, the assistant can only recommend
        and link to sites it&rsquo;s allowed to read. Here&rsquo;s how the {sites.length} we compare stand.
      </p>
      {comparisons.length > 0 && (
        <p>Comparing tools? See {comparisons.map((p, i) => <span key={p.host}>{i ? ', ' : ''}<Link href={`/alternatives/${p.host}`}>{alt.products[p.host].name} alternatives</Link></span>)}.</p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Site</th><th>Overall</th><th>AI assistants allowed</th><th>Homepage readable</th><th>Page list for search engines</th></tr></thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.host}>
                <td><Link href={`/sites/${s.host}`}>{s.name ?? s.host}</Link>{s.name && <div className="muted small">{s.host}</div>}{s.ours && <div className="muted small">Made by the Knownsite team</div>}</td>
                <td>{verdict(s).headline}</td>
                <td>{assistantsAllowed(s)}</td>
                <td>{homepageReadable(s)}</td>
                <td>{yes(s.sitemap?.found)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        &ldquo;AI assistants allowed&rdquo;: ChatGPT, Claude and Perplexity. &ldquo;Homepage readable&rdquo;: whether the homepage has real text before
        any extra code runs, which is what most AI tools read. Checked {fmtDate(sites[0]?.checkedAt ?? '')} by <Link href="/bot">our crawler</Link>.
        Being listed doesn&rsquo;t mean a site uses or endorses Knownsite. Missing a site? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
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
      {s.title && s.title !== s.name && <p className="lede">{s.title}</p>}
      {s.description && <p>&ldquo;{s.description}&rdquo; <span className="muted small">(the site&rsquo;s own description)</span></p>}
      {(() => {
        const v = verdict(s);
        return (
          <div className="card">
            <p className="eyebrow" style={{ margin: 0 }}>Can AI assistants read this site?</p>
            <h2 style={{ margin: '6px 0 10px' }} className={v.level === 'good' ? 'ok' : v.level === 'poor' ? 'bad' : undefined}>{v.headline}</h2>
            <ul style={{ margin: 0 }}>{plainFacts(s).map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        );
      })()}
      <p className="muted small">
        Why it matters: when someone asks ChatGPT, Claude or Perplexity for a recommendation, the assistant can only suggest and link
        to sites it can read. {s.ours ? 'Made by the Knownsite team. ' : ''}{(s.knownsiteLevel ?? 0) >= 2 ? 'This site publishes signed Knownsite records. ' : ''}
        Checked {fmtDate(s.checkedAt)} by <Link href="/bot">our crawler</Link>. Facts only; not an endorsement.
      </p>

      {(ownPages.length > 0 || listedOn.length > 0) && (
        <>
          <h2>Compared with other tools</h2>
          <ul>
            {ownPages.map((p) => <li key={p.host}><Link href={`/alternatives/${p.host}`}>{alt.products[p.host].name} alternatives</Link></li>)}
            {listedOn.map((p) => <li key={p.host}>Listed on <Link href={`/alternatives/${p.host}`}>{alt.products[p.host].name} alternatives</Link></li>)}
          </ul>
        </>
      )}

      <div className="card">
        <p style={{ margin: 0 }}>
          <strong>Is this your site?</strong> Add <Link href="/how-it-works">Knownsite</Link> to fix what&rsquo;s missing on every deploy
          and to claim this page. A free <Link href="/check">online check</Link> is coming soon. To correct or remove this page, email{' '}
          <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
        </p>
      </div>

      <h2 style={{ marginTop: 48 }}>Technical details</h2>
      <p className="muted">For developers and site owners: what the plain answer above is based on.</p>
      <div className="stats">
        <div className="stat"><div className="stat-label">AI search crawlers</div><div className="stat-value">{aiSearchSummary(s)}</div></div>
        <div className="stat"><div className="stat-label">Text without JavaScript</div><div className="stat-value">{textSummary(s)}</div></div>
        <div className="stat"><div className="stat-label">Sitemap</div><div className="stat-value">{s.sitemap?.found ? `Yes, ${s.sitemap.entries.toLocaleString('en-US')} entries` : 'Not found'}</div></div>
        <div className="stat"><div className="stat-label">llms.txt</div><div className="stat-value">{s.llmsTxt ? 'Yes' : 'No'}</div></div>
      </div>
      <p className="muted small">
        robots.txt is the file where a site tells crawlers what they may read. A sitemap lists a site&rsquo;s pages for search engines.
        llms.txt is a newer, optional summary of a site written for AI tools. &ldquo;Text without JavaScript&rdquo; is what a crawler reads before
        running any of the page&rsquo;s code.
      </p>

      {s.robots ? (
        <>
          {!s.robots.found && <p className="muted" style={{ marginTop: 24 }}>No robots.txt found, so every crawler is allowed.</p>}
          <BotTable title="AI search crawlers" bots={AI_SEARCH_BOTS} allow={s.robots.aiSearch} />
          <BotTable title="Search engines" bots={SEARCH_BOTS} allow={s.robots.search} />
          <BotTable title="AI training crawlers" bots={TRAINING_BOTS} allow={s.robots.training} />
          <p className="muted small">From the homepage rules in robots.txt. Blocking training crawlers is the site owner&rsquo;s choice; it doesn&rsquo;t stop AI search from citing the site.</p>
        </>
      ) : <p className="muted">robots.txt could not be read.</p>}

      <ul>
        <li>Structured data (JSON-LD) on the homepage: {s.jsonLd == null ? 'not measured' : s.jsonLd ? 'yes' : 'no'}</li>
        {s.noindex && <li>The homepage asks search engines not to index it (noindex).</li>}
        {platform && <li>Detected: {platform}.</li>}
      </ul>

      {others.length > 0 && (
        <>
          <h2>Similar sites</h2>
          <p>{others.map((o, i) => <span key={o.host}>{i ? ' · ' : ''}<Link href={`/sites/${o.host}`}>{o.name ?? o.host}</Link></span>)}</p>
        </>
      )}

    </>
  );
}
