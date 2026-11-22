'use client';

import { useEffect, useState } from 'react';

/** "Talk to us": stores a lead via the check API. No email address is published on the site. */
export default function Contact({ api }: { api: string }) {
  const [form, setForm] = useState({ email: '', site: '', plan: 'business', message: '' });
  const [state, setState] = useState<{ sending?: boolean; sent?: boolean; error?: string }>({});
  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get('plan');
    if (plan === 'pro' || plan === 'business') setForm((f) => ({ ...f, plan }));
  }, []);
  if (!api) return <p className="muted">Reply to the message that brought you here and we&apos;ll set up a call.</p>;
  if (state.sent) return <p className="ok"><strong>Thanks. We&apos;ll email you within one business day.</strong></p>;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ sending: true });
    try {
      const res = await fetch(`${api.replace(/\/$/, '')}/api/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      setState(res.ok ? { sent: true } : { error: json.error ?? 'Something went wrong.' });
    } catch {
      setState({ error: 'Could not reach us. Try again in a moment.' });
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="contact-form" onSubmit={send}>
      <label>Work email<input type="email" required value={form.email} onChange={set('email')} /></label>
      <label>Website<input type="text" inputMode="url" placeholder="your-site.com" value={form.site} onChange={set('site')} /></label>
      <label>Plan<select value={form.plan} onChange={set('plan')}><option value="business">Business</option><option value="pro">Pro</option><option value="other">Not sure yet</option></select></label>
      <label>Anything we should know?<textarea rows={3} value={form.message} onChange={set('message')} /></label>
      <button type="submit" disabled={state.sending}>{state.sending ? 'Sending…' : 'Talk to us'}</button>
      {state.error && <p className="bad">{state.error}</p>}
    </form>
  );
}
