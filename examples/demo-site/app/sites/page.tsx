import Link from 'next/link';
import { pageMeta, SALES_EMAIL } from '../meta';
import { directory, listed, study, fmtDate, allHosts } from './data';
import { data as altData, publishedPages } from '../alternatives/data';

export const metadata = pageMeta('/sites', 'Can AI assistants read these sites?',
  'Tools compared side by side, and for each one whether ChatGPT, Claude and Perplexity can read its site, and so recommend it.');

export default function Sites() {
  const d = directory();
  const s = study();
  const total = allHosts().length;
  const alt = altData();
  const altPages = publishedPages(alt).map((p) => ({ host: p.host, name: alt.products[p.host].name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <p className="eyebrow">Directory</p>
      <h1>Can AI assistants read these sites?</h1>
      <p className="lede">
        When you ask ChatGPT, Claude or Google for the best tool for a job, the assistant can only recommend and link to websites
        it&rsquo;s able to read. We compare popular tools side by side, and check each one&rsquo;s website to see what AI assistants can
        read there. {total} sites so far, explained in plain terms.
      </p>

      {altPages.length > 0 && (
        <>
          <h2>Compare tools</h2>
          <p>Each page compares a popular tool with others that do the same job: prices, free plans and what you get, from each company&rsquo;s own website.</p>
          <p>{altPages.map((p, i) => <span key={p.host}>{i ? ' · ' : ''}<Link href={`/alternatives/${p.host}`}>{p.name} alternatives</Link></span>)}</p>
        </>
      )}

      <h2>Which sites can AI assistants read?</h2>
      <p>Pick a category to see, for each site, whether ChatGPT, Claude and Perplexity can read it.</p>
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

      {s && (
        <div className="card">
          <h2 style={{ margin: 0 }}><Link href="/study/ai-crawler-access">Study: which of the top {s.top.toLocaleString('en-US')} websites block AI?</Link></h2>
          <p style={{ margin: '4px 0 0' }}>The same check across the most-visited websites, updated monthly.</p>
        </div>
      )}

      <h2>Own a site here, or want one added?</h2>
      <ul>
        <li><strong>Claim your page:</strong> add Knownsite to your website (developers: <code>npx knownsite init</code>) and your page will show your own description and terms. Claiming opens soon.</li>
        <li><strong>Suggest a site or ask for removal:</strong> email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>. Removals are done within 7 days, no questions asked.</li>
        <li><strong>Check any site now:</strong> <Link href="/check">run the free check</Link>.</li>
      </ul>
      <p className="muted small">
        Checked {fmtDate(d.generatedAt)} from each site&rsquo;s public pages by <Link href="/bot">our crawler</Link>. Facts only: being listed
        doesn&rsquo;t mean a site uses or endorses Knownsite. No paid placement.
      </p>
    </>
  );
}
