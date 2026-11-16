import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: { absolute: 'Knownsite: make your site known to search engines and AI assistants' },
};

export default function Home() {
  return (
    <>
      <h1>Make your site known to search engines and AI assistants.</h1>
      <p className="lede">
        Knownsite is an open standard and a free command-line tool. It runs when your site builds and makes
        every page readable and findable by Google, Bing, ChatGPT, Claude and Perplexity, with you, the
        owner, in control of how your content is used.
      </p>

      <h2>1. See where you stand</h2>
      <p>Checks what search and AI crawlers actually get from your site and scores it from 0 to 100, with
        the fix for each problem.</p>
      <pre>{`npx knownsite check https://your-site.com`}</pre>

      <h2>2. Add it to your build</h2>
      <pre>{`npx knownsite init --site https://your-site.com   # once: config + signing key
# in package.json, after your framework's build:
"build": "next build && knownsite build"
# after each deploy:
npx knownsite notify`}</pre>
      <p className="muted">Works today with sites that build to static HTML: Next.js
        (<code>output: &apos;export&apos;</code>), Astro, Hugo, Eleventy or plain HTML. Single-page React apps
        (Vite, Lovable, Bolt) are next.</p>

      <h2>What each build adds</h2>
      <ul>
        <li>A sitemap, and a <code>robots.txt</code> that points to it</li>
        <li><code>llms.txt</code>, a plain summary AI assistants can read</li>
        <li>Structured data (schema.org JSON-LD) in every page</li>
        <li>A signed record of each page, so anyone can confirm what you published and when</li>
        <li>Your usage terms: search, AI answers with citation, model training, each allowed or not</li>
      </ul>
      <p>After deploy, <code>notify</code> tells Bing (and through it ChatGPT search and Copilot) and other
        engines exactly which pages changed, so they are recrawled in hours instead of weeks.</p>

      <h2>Owners stay in control</h2>
      <p>Your site signs its own records with a key only you hold, and declares its own terms. Knownsite does
        not rank anything and does not sit between you and your visitors: it is files in your own build.</p>

      <div className="card">
        <p><strong>Early access.</strong> Knownsite is being tested with a small group of sites before it
          launches. If someone sent you this page, you are one of them: reply to their message with your
          site&apos;s address and any questions, and we will help you set it up.</p>
        <p style={{ marginBottom: 0 }}>
          <Link href="/spec">Read the spec</Link> · <Link href="/how-it-works">How it works</Link> ·{' '}
          <Link href="/discovery">This site&apos;s own discovery report</Link>
        </p>
      </div>
    </>
  );
}
