'use client';

import { useState } from 'react';

type Result = {
  engine: string; brand: string; question: string; mentioned: boolean; position: number | null; brandsNamed: number;
  citedOwn: string[]; citedOthers: string[]; excerpt: string | null;
};

/** "Does ChatGPT recommend you?" One free question, email required. */
export default function Recommend({ api, engine }: { api: string; engine: string }) {
  const [site, setSite] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ loading?: boolean; error?: string; result?: Result }>({});
  if (!api) return null;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true });
    try {
      const res = await fetch(`${api.replace(/\/$/, '')}/api/sample`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: site, email }),
      });
      const json = await res.json();
      setState(res.ok ? { result: json } : { error: json.error ?? 'Something went wrong. Try again.' });
    } catch {
      setState({ error: 'Could not reach us. Try again in a moment.' });
    }
  }

  const r = state.result;
  return (
    <div className="card recommend">
      <h2 style={{ marginTop: 0 }}>Does {engine} recommend you?</h2>
      <p className="muted">We&apos;ll ask {engine} the question your customers would ask, based on your homepage, and show
        whether it mentions you and which sites it cites. One free question per site per day.</p>
      {!r && (
        <form className="recommend-form" onSubmit={run}>
          <input type="text" inputMode="url" placeholder="your-site.com" aria-label="Your website" value={site} onChange={(e) => setSite(e.target.value)} required />
          <input type="email" placeholder="you@company.com" aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" disabled={state.loading}>{state.loading ? `Asking ${engine}…` : `Ask ${engine}`}</button>
        </form>
      )}
      {state.loading && <p className="muted">Writing the question and waiting for {engine}&apos;s answer. About 30 seconds.</p>}
      {state.error && <p className="bad">{state.error}</p>}
      {r && (
        <div aria-live="polite">
          <p className="muted" style={{ marginBottom: 4 }}>We asked {r.engine}:</p>
          <p><strong>&ldquo;{r.question}&rdquo;</strong></p>
          {r.mentioned
            ? <p className="ok"><strong>✓ {r.brand} was mentioned{r.position && r.brandsNamed > 1 ? `, #${r.position} of ${r.brandsNamed} brands named` : ''}.</strong></p>
            : <p className="bad"><strong>✗ {r.brand} wasn&apos;t mentioned.</strong></p>}
          {r.excerpt && <blockquote className="muted">{r.excerpt}</blockquote>}
          {r.citedOwn.length > 0 && <p>Your pages it cited: {r.citedOwn.map((u) => <span key={u} className="url"><br />{u}</span>)}</p>}
          {r.citedOthers.length > 0 && <p>Sites it cited instead: {r.citedOthers.map((u) => <span key={u} className="url"><br />{u}</span>)}</p>}
          <p className="muted">Asked fresh, with no chat history, so it&apos;s closer to what a new customer sees than asking in
            your own ChatGPT, which remembers you.</p>
          <p>One question is a snapshot. <a href="/pricing">Track 20 to 50 questions every week</a> across ChatGPT, Claude,
            Perplexity and Gemini, see which competitors get named, and what to change.</p>
        </div>
      )}
    </div>
  );
}
