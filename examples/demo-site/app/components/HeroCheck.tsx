'use client';

import { useState } from 'react';

/** URL box in the hero; until the online check is live, the same check as a terminal command. */
export default function HeroCheck({ api }: { api: string }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  if (!api) {
    const cmd = 'npx knownsite check your-site.com';
    return (
      <div className="hero-cmd">
        <code>{cmd}</code>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    );
  }
  return (
    <form className="hero-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) window.location.href = `/check?url=${encodeURIComponent(url.trim())}`; }}>
      <input type="text" inputMode="url" placeholder="your-site.com" aria-label="Your website" value={url} onChange={(e) => setUrl(e.target.value)} required />
      <button type="submit">Check it free <span className="arrow">→</span></button>
    </form>
  );
}
