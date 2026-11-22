'use client';

import { useEffect, useState } from 'react';

type Check = { id: string; group: string; status: 'pass' | 'fail' | 'warn' | 'unknown'; points: number; max: number; message: string };
type Crawler = { token: string; who: string; status: Check['status']; message: string };
type Report = {
  url: string; score: number; band: string; critical: string[]; notes?: string[];
  checks: Check[]; crawlers: Crawler[]; training: { token: string; allowed: boolean }[];
  fixes: { fix: string; gain?: number }[]; cached?: boolean;
};

const BANDS: Record<string, string> = {
  discoverable: 'Discoverable', 'partly-visible': 'Partly visible', 'mostly-invisible': 'Mostly invisible', unreachable: 'Unreachable',
};
const ICON: Record<Check['status'], string> = { pass: '✓', fail: '✗', warn: '!', unknown: '?' };
/** Checker messages mark commands with `backticks`; show those as code. */
const md = (text: string) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
const tone = (s: Check['status']) => (s === 'pass' ? 'ok' : s === 'fail' ? 'bad' : 'muted');

export default function Checker({ api }: { api: string }) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<{ loading?: boolean; error?: string; report?: Report }>({});

  async function run(target: string) {
    const value = target.trim();
    if (!value || !api) return;
    setState({ loading: true });
    const share = new URL(window.location.href);
    share.searchParams.set('url', value);
    window.history.replaceState(null, '', share);
    try {
      const res = await fetch(`${api.replace(/\/$/, '')}/api/check?url=${encodeURIComponent(value)}`);
      const json = await res.json();
      setState(res.ok ? { report: json } : { error: json.error ?? `Check failed (HTTP ${res.status})` });
    } catch {
      setState({ error: 'Could not reach the checker. Try again in a moment.' });
    }
  }

  // Shareable links: /check?url=example.com runs the check on load.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('url');
    if (q) { setUrl(q); run(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!api) {
    return <div className="card"><p style={{ margin: 0 }}>The online check isn&apos;t switched on here yet. Run it from your
      terminal instead: <code>npx knownsite check your-site.com</code></p></div>;
  }

  const r = state.report;
  return (
    <>
      <form className="check-form" onSubmit={(e) => { e.preventDefault(); run(url); }}>
        <input type="text" inputMode="url" autoComplete="url" placeholder="your-site.com" aria-label="Website address"
          value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button type="submit" disabled={state.loading}>{state.loading ? 'Checking…' : 'Check'}</button>
      </form>
      {state.loading && <p className="muted">Fetching your site as each crawler would. This takes 5 to 20 seconds.</p>}
      {state.error && <div className="card"><p className="bad" style={{ margin: 0 }}>{state.error}</p></div>}
      {r && (
        <div aria-live="polite">
          <div className="card score-card">
            <div className={`score ${r.band === 'discoverable' ? 'ok' : r.band === 'partly-visible' ? '' : 'bad'}`}>{r.score}<span>/100</span></div>
            <div>
              <strong>{BANDS[r.band] ?? r.band}</strong>
              <div className="muted url">{r.url}</div>
            </div>
          </div>
          {r.critical.map((c) => <p key={c} className="bad">✗ {md(c)}</p>)}
          {(r.notes ?? []).map((n) => <p key={n} className="muted">• {n}</p>)}

          {r.fixes.length > 0 && (<>
            <h2>What to fix, biggest first</h2>
            <ol>{r.fixes.map((f) => <li key={f.fix}>{f.gain ? <strong>+{f.gain} </strong> : null}{md(f.fix)}</li>)}</ol>
            <p className="muted">Knownsite fixes most of these on every deploy: <code>npx knownsite init</code>, then add{' '}
              <code>knownsite build</code> after your build. <a href="/">How it works</a></p>
          </>)}

          {r.crawlers.length > 0 && (<>
            <h2>What each crawler gets</h2>
            <table><tbody>{r.crawlers.map((c) => (
              <tr key={c.token}><td className={tone(c.status)}>{ICON[c.status]}</td><td><strong>{c.who}</strong><br /><span className="muted">{c.token}</span></td><td>{md(c.message)}</td></tr>
            ))}</tbody></table>
          </>)}

          <h2>All checks</h2>
          <table><tbody>{r.checks.filter((c) => c.group !== 'crawlers').map((c) => (
            <tr key={c.id}><td className={tone(c.status)}>{ICON[c.status]}</td><td>{c.points}/{c.max}</td><td>{md(c.message)}</td></tr>
          ))}</tbody></table>
          {r.cached && <p className="muted">Checked in the last 10 minutes; showing that result.</p>}
        </div>
      )}
    </>
  );
}
