import Link from 'next/link';
import { pageMeta, SALES_EMAIL, SITE } from '../meta';
import { API, LICENSE, RECHECK_DAYS, indexRecord, toolRecord, apiTools } from './v1/data';

export const metadata = pageMeta('/api', 'Software tool facts API',
  'Prices, free plans and what you get for software tools, as free JSON. Every fact has the quote and page it came from, and the date it was checked.',
  { json: `${API}/index.json` });

const EXAMPLE_KEY = 'notion.com';

/** A real record, trimmed so the example stays short. */
function example() {
  const key = apiTools().includes(EXAMPLE_KEY) ? EXAMPLE_KEY : apiTools()[0];
  const r = toolRecord(key);
  const short = { key: r.key, name: r.name, url: r.url, category: r.category, checked: r.checked, recheckBy: r.recheckBy, stale: r.stale,
    facts: r.facts.slice(0, 2), alternatives: r.alternatives.slice(0, 2), '…': 'more fields below' };
  return { key, checked: r.checked, json: JSON.stringify(short, null, 2) };
}

const FIELDS: [string, string][] = [
  ['key', 'The tool’s id: its host, or a name like adobe-photoshop when one company has several tools.'],
  ['name, host, url', 'The tool’s name and website.'],
  ['category', 'The category it’s compared in, with a link to the category’s JSON.'],
  ['does', 'One sentence on what the company says the tool does.'],
  ['checked', 'The day we read the company’s pages (YYYY-MM-DD).'],
  ['recheckBy, stale', `${RECHECK_DAYS} days after checked. When stale is true, check the source page before repeating a fact.`],
  ['facts[]', 'One entry per comparison field: field, value, quote (copied from the company’s page) and source (the page it’s on).'],
  ['facts[].status', '"not_shown" when the company’s pages don’t say. value is then null. We never guess.'],
  ['sources', 'Every page we read for this tool.'],
  ['alternatives', 'Tools that do the same job, each with a link to its own JSON.'],
  ['namedTogetherByAI', 'When we asked ChatGPT, Claude and Gemini buyer questions, how many answers named each tool. Null if not measured.'],
  ['aiAccess', 'Whether AI assistants are allowed to read the tool’s website, and whether its homepage has text without JavaScript.'],
  ['ours', 'True for tools made by the Knownsite team. They get no special placement.'],
  ['claimed', 'True once the company confirms its facts by signing them with Knownsite (coming).'],
  ['pages', 'The human-readable pages for this tool on knownsite.dev.'],
  ['license', `${LICENSE.name}: free to use, including commercially, if you credit ${LICENSE.attribution}.`],
];

export default function ApiDocs() {
  const idx = indexRecord();
  const ex = example();
  return (
    <>
      <p className="eyebrow">API</p>
      <h1>Software tool facts, as JSON</h1>
      <p className="lede">
        Prices, free plans and what you get for {idx.tools.length} software tools in {idx.categories.length} categories. Every fact comes with the
        quote and page it came from and the date we checked it, so an app or AI assistant can cite the company directly. Free, no key, no signup.
      </p>

      <div className="card">
        <ul style={{ margin: 0 }}>
          <li>Facts come only from each company&rsquo;s own pages.</li>
          <li>&ldquo;Not shown&rdquo; means the company&rsquo;s pages don&rsquo;t say. We never guess.</li>
          <li>No paid placement. Tools made by the Knownsite team are marked.</li>
          <li>Re-checked monthly. Facts older than {RECHECK_DAYS} days are marked stale.</li>
        </ul>
      </div>

      <h2>Quick start</h2>
      <table>
        <tbody>
          <tr><td><a href={`${API}/index.json`}><code>{API}/index.json</code></a></td><td>Every category and tool, with links to their files</td></tr>
          <tr><td><a href={`${API}/tools/${ex.key}.json`}><code>{API}/tools/&lt;key&gt;.json</code></a></td><td>One tool</td></tr>
          <tr><td><a href={`${API}/categories/${idx.categories[0]?.slug}.json`}><code>{API}/categories/&lt;slug&gt;.json</code></a></td><td>A category&rsquo;s comparison fields and its tools</td></tr>
        </tbody>
      </table>
      <pre><code>{`curl ${SITE}${API}/tools/${ex.key}.json`}</code></pre>
      <p>Part of the response:</p>
      <pre><code>{ex.json}</code></pre>
      <p className="muted small">
        Each page on knownsite.dev also points to its JSON with <code>&lt;link rel=&quot;alternate&quot; type=&quot;application/json&quot;&gt;</code>.
        Files can be fetched from any website or app (CORS is open) and are rebuilt whenever the data changes.
      </p>

      <h2>Fields</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Field</th><th>What it means</th></tr></thead>
          <tbody>{FIELDS.map(([f, d]) => <tr key={f}><td><code>{f}</code></td><td>{d}</td></tr>)}</tbody>
        </table>
      </div>

      <h2>Using it well</h2>
      <ul>
        <li>When you repeat a fact, link to its <code>source</code>, the company&rsquo;s own page.</li>
        <li>If <code>stale</code> is true, check the source page first. Prices change.</li>
        <li>Credit us, for example: <em>Source: Knownsite (knownsite.dev), checked {ex.checked}.</em></li>
        <li>Please cache responses. The data changes at most a few times a month.</li>
      </ul>

      <h2>Versions</h2>
      <p>
        <code>v1</code> won&rsquo;t break: fields may be added, never removed or renamed. A breaking change would get a new <code>/api/v2</code>,
        with <code>v1</code> kept running alongside it.
      </p>

      <h2>Coming next</h2>
      <ul>
        <li>An MCP server, so AI agents can search tools, get a tool&rsquo;s facts, list alternatives and compare tools directly.</li>
        <li>More categories. See them as they&rsquo;re added on the <Link href="/sites">directory</Link>.</li>
      </ul>

      <h2>For companies listed here</h2>
      <p>
        Something wrong or out of date? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> and we&rsquo;ll re-check it. Removals are done
        within 7 days, no questions asked. Soon you&rsquo;ll be able to confirm your own facts by signing them with Knownsite.
      </p>
    </>
  );
}
