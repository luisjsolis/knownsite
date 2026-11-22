import Link from 'next/link';
import { pageMeta } from './meta';

export const metadata = pageMeta('/', 'Knownsite: get your site found by search engines and AI assistants',
  'Free, open-source tool that gets your site indexed by Google, Bing, ChatGPT, Claude and Perplexity automatically, every time you deploy.',
  { absoluteTitle: true });

export default function Home() {
  return (
    <>
      <h1>Get your site found by search engines and AI assistants.</h1>
      <p className="lede">
        Getting indexed shouldn&apos;t take a setup for every engine. Knownsite runs every time your site
        deploys: it makes every page readable, generates the sitemap and structured data, tells search engines
        and AI assistants exactly what changed, and signs a record of what you published. You set the terms for
        how AI can use your work. Free, open source, and part of your build.
      </p>

      <h2>1. See where you stand</h2>
      <p>Checks what search and AI crawlers actually get from your site and scores it from 0 to 100, with
        the fix for each problem. <Link href="/check">Check your site online</Link>, or from your terminal:</p>
      <pre>{`npx knownsite check https://your-site.com`}</pre>

      <h2>2. Add it to your build</h2>
      <pre>{`npx knownsite init --site https://your-site.com   # once: config + signing key
# in package.json, after your framework's build:
"build": "next build && knownsite build"
# after each deploy:
npx knownsite notify`}</pre>
      <p className="muted">Works today with sites that build to static HTML: Next.js
        (<code>output: &apos;export&apos;</code>), Astro, Hugo, Eleventy or plain HTML. Next.js server mode and
        single-page apps (Vite, Bolt) are next.</p>

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

      <h2>3. See what happened</h2>
      <p>Which AI and search crawlers read your pages after a change, and how many people arrived from
        ChatGPT, Claude or Perplexity answers. Crawlers don&apos;t run JavaScript, so your analytics never see
        them; Knownsite records them where they arrive (preview, Next.js today).</p>
      <pre>{`/pricing  changed Tue, Nov 17
  → told Bing, Yandex, Naver, Seznam, Yep  the same day
  → OAI-SearchBot re-read it  Wed, Nov 18 (+18h)
  → 40 visitors from AI answers since (ChatGPT 40)`}</pre>

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
