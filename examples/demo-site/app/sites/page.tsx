import Link from 'next/link';
import { pageMeta, SALES_EMAIL } from '../meta';
import { directory, listed, study, fmtDate } from './data';

export const metadata = pageMeta('/sites', 'Site directory: what AI crawlers can read',
  'Sites by category, with what each one lets AI search engines and AI training crawlers read, measured from its public files.');

export default function Sites() {
  const d = directory();
  const s = study();
  const total = d.categories.reduce((n, c) => n + listed(c).length, 0);
  return (
    <>
      <p className="eyebrow">Directory</p>
      <h1>What AI crawlers can read, site by site</h1>
      <p className="lede">
        {total} sites in {d.categories.length} categories. For each one: which AI search engines and training crawlers
        its robots.txt lets in, how much of its homepage a crawler reads without JavaScript, and whether it has a sitemap
        and llms.txt.
      </p>
      <p className="muted small">
        Measured {fmtDate(d.generatedAt)} from each site&rsquo;s public files by <Link href="/bot">KnownsiteBot</Link>.
        Facts only: being listed does not mean a site uses or endorses Knownsite. No paid placement.
      </p>

      {s && (
        <div className="card">
          <h2 style={{ margin: 0 }}><Link href="/study/ai-crawler-access">Study: which of the top {s.top.toLocaleString('en-US')} sites block AI crawlers?</Link></h2>
          <p style={{ margin: '4px 0 0' }}>The same measurements across the most-visited sites on the web, updated monthly.</p>
        </div>
      )}

      <h2>Categories</h2>
      <table>
        <thead><tr><th>Category</th><th>Sites</th></tr></thead>
        <tbody>
          {d.categories.map((c) => (
            <tr key={c.slug}>
              <td><Link href={`/sites/${c.slug}`}>{c.name}</Link><div className="muted small">{c.description}</div></td>
              <td>{listed(c).length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Own a site here, or want one added?</h2>
      <ul>
        <li><strong>Claim your page:</strong> install Knownsite (<code>npx knownsite init</code>) and your page will show your own signed description and AI terms. Claiming opens soon.</li>
        <li><strong>Suggest a site or ask for removal:</strong> email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>. Removals are done within 7 days, no questions asked.</li>
        <li><strong>Check any site now:</strong> <Link href="/check">run the free check</Link>.</li>
      </ul>
    </>
  );
}
