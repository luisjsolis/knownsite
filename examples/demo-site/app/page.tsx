import Link from 'next/link';
import { pageMeta } from './meta';
import HeroVisual from './components/HeroVisual';
import HeroCheck from './components/HeroCheck';

export const metadata = pageMeta('/', 'Knownsite: get your site found by search engines and AI assistants',
  'Free, open-source tool that gets your site indexed by Google, Bing, ChatGPT, Claude and Perplexity automatically, every time you deploy.',
  { absoluteTitle: true });

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <a className="pill" href="https://github.com/luisjsolis/knownsite">Open standard · v0.1.3 on npm <span className="arrow">→</span></a>
            <h1>Get your site <span className="grad">found</span> by search engines and AI assistants.</h1>
            <p className="lede">Knownsite runs on every deploy: readable pages, sitemap and structured data, instant change
              notifications to search engines, and proof of what happened next.</p>
            <HeroCheck api={process.env.NEXT_PUBLIC_CHECK_API ?? ''} />
            <p className="muted small">Free and open source. No sign-up for the check. <Link href="/pricing">Plans for marketing teams →</Link></p>
          </div>
          <HeroVisual />
        </div>
        <div className="works-with">
          <span className="ww-label">Works with</span>
          {['Next.js', 'Astro', 'Vite', 'Bolt', 'Hugo', 'Eleventy', 'Vercel', 'Firebase', 'Netlify'].map((n) => <span key={n} className="ww-item">{n}</span>)}
        </div>
        <div className="works-with">
          <span className="ww-label">Notifies</span>
          {['Bing', 'Yandex', 'Naver', 'Seznam', 'Yep'].map((n) => <span key={n} className="ww-item">{n}</span>)}
          <span className="muted small">· Bing also feeds ChatGPT search and Copilot</span>
        </div>
      </section>

      <section className="section">
        <p className="eyebrow" style={{ marginTop: 0 }}>How it works</p>
        <h2>Three steps, then it runs on every deploy</h2>
        <div className="grid">
          <div className="feature"><span className="step-n">1</span><h3>See where you stand</h3>
            <p>What Google, Bing, ChatGPT, Claude and Perplexity actually get from your site, scored 0 to 100, with the fix for each problem.</p></div>
          <div className="feature"><span className="step-n">2</span><h3>Add it to your build</h3>
            <p>One line after your framework&apos;s build. Every deploy gets a sitemap, structured data, an AI summary and signed records.</p></div>
          <div className="feature"><span className="step-n">3</span><h3>See what happened</h3>
            <p>Which AI and search crawlers re-read your pages after a change, and how many people arrived from AI answers.</p></div>
        </div>
        <pre>{`npx knownsite check your-site.com                 # where you stand
npx knownsite init --site https://your-site.com   # once: config + signing key
"build": "next build && knownsite build"          # every build
npx knownsite notify                              # after each deploy`}</pre>
        <p className="muted small">Works today with static HTML builds (Next.js, Astro, Hugo, Eleventy), Next.js server mode, and
          single-page apps (Vite, Bolt) through <code>knownsite prerender</code>.</p>
      </section>

      <section className="section">
        <p className="eyebrow" style={{ marginTop: 0 }}>Every build</p>
        <h2>What Knownsite adds</h2>
        <div className="grid">
          <div className="feature"><h3>Sitemap and robots.txt</h3><p>So every engine finds every page, without a setup per engine.</p></div>
          <div className="feature"><h3>Readable pages</h3><p>Real HTML for crawlers that don&apos;t run JavaScript, including single-page apps.</p></div>
          <div className="feature"><h3>Structured data and llms.txt</h3><p>Schema.org JSON-LD in every page, and a plain summary AI assistants can read.</p></div>
          <div className="feature"><h3>Instant change notifications</h3><p>Bing (and through it ChatGPT search and Copilot) learns which pages changed, in hours instead of weeks.</p></div>
          <div className="feature"><h3>Signed records</h3><p>Anyone can confirm what you published and when, with a key only you hold.</p></div>
          <div className="feature"><h3>Your usage terms</h3><p>Search, AI answers with citation, model training: each allowed or not, by you.</p></div>
        </div>
      </section>

      <section className="section">
        <p className="eyebrow" style={{ marginTop: 0 }}>Case study · our own site</p>
        <h2>reina.web.app: from 6 words to 100/100</h2>
        <p className="muted">Reina de la Paz is a daily Catholic prayer site we built at WellnessLabs. Its homepage loaded the
          day&apos;s Gospel with JavaScript, so most AI crawlers saw almost nothing.</p>
        <div className="compare">
          <div className="compare-col">
            <div className="compare-label bad">Before · what a crawler read on Nov 9</div>
            <pre className="crawler-view">{`Cargando la oración de hoy…
("Loading today's prayer…")`}</pre>
            <div className="small muted">6 words · no structured data · no llms.txt</div>
          </div>
          <div className="compare-col">
            <div className="compare-label ok">After · what a crawler read on Nov 21</div>
            <pre className="crawler-view">{`Hoy Sábado, 21 de noviembre
Evangelio Lucas 20, 27-40
27 Llegaron despues algunos de los
sadduceos, los cuales niegan la
resurreccion…`}</pre>
            <div className="small muted">477 words · structured data · llms.txt · signed records</div>
          </div>
        </div>
        <ol className="case-steps">
          <li><span className="case-date">Nov 9</span><span><strong>40/100.</strong> The Knownsite check found the empty homepage, missing structured data and no llms.txt.</span></li>
          <li><span className="case-date">Nov 9</span><span><strong>85/100.</strong> Same day: the prayer is rendered into the page&apos;s HTML, plus structured data and llms.txt.</span></li>
          <li><span className="case-date">Nov 21</span><span><strong>100/100.</strong> Knownsite installed in the build: 80 pages signed, and every deploy tells Bing and other engines what changed.</span></li>
        </ol>
        <p className="muted small">Scores are from the free check, which you can run on reina.web.app yourself. We don&apos;t have
          traffic results to share yet; we&apos;ll publish them when we do.</p>
      </section>

      <section className="section">
        <p className="eyebrow" style={{ marginTop: 0 }}>The report</p>
        <h2>See which AI crawlers read you, and who arrived</h2>
        <p className="muted">Crawlers don&apos;t run JavaScript, so your analytics never see them. Knownsite records them where they
          arrive, checks each one against the operator&apos;s published addresses, and counts people coming from AI answers.</p>
        <div className="window report-preview">
          <div className="window-bar"><span /><span /><span /><em>knownsite report · last 30 days · example</em></div>
          <table>
            <thead><tr><th>Crawler</th><th className="col-for">For</th><th>Visits</th><th>Verified</th></tr></thead>
            <tbody>
              <tr><td><strong>OAI-SearchBot</strong></td><td className="col-for">ChatGPT search</td><td>48</td><td className="ok">48 ✓</td></tr>
              <tr><td><strong>bingbot</strong></td><td className="col-for">Bing, Copilot, ChatGPT</td><td>112</td><td className="ok">112 ✓</td></tr>
              <tr><td><strong>Claude-SearchBot</strong></td><td className="col-for">Claude</td><td>19</td><td className="muted">no public list</td></tr>
              <tr><td><strong>PerplexityBot</strong></td><td className="col-for">Perplexity</td><td>23</td><td className="ok">21 ✓</td></tr>
            </tbody>
          </table>
          <div className="preview-foot">
            <span>Visitors from AI answers: <strong>ChatGPT 40</strong> · Perplexity 9 · Claude 3</span>
            <span className="bad">2 fake &ldquo;crawlers&rdquo; from the wrong IPs, not counted</span>
          </div>
        </div>
      </section>

      <section className="section">
        <p className="eyebrow" style={{ marginTop: 0 }}>Why Knownsite</p>
        <h2>Fixes the cause, and proves what worked</h2>
        <div className="grid">
          <div className="feature"><h3>Fixes, not just reports</h3><p>Monitoring tools tell you what&apos;s wrong. Knownsite fixes the technical side on every deploy.</p></div>
          <div className="feature"><h3>Proof of cause and effect</h3><p>You changed a page, engines were told, AI crawlers re-read it, answers started citing it, people arrived.</p></div>
          <div className="feature"><h3>Open, no lock-in</h3><p>An open standard and plain files in your own build. Nothing sits between you and your visitors.</p></div>
        </div>
      </section>

      <section className="section">
        <p className="eyebrow" style={{ marginTop: 0 }}>Questions</p>
        <h2>Straight answers</h2>
        <div className="faq">
          <details><summary>Will Knownsite get me to the top of Google or ChatGPT?</summary>
            <p>No one can honestly promise rankings. Knownsite makes sure search engines and AI assistants can read every
              page, find it, and hear about changes quickly. What ranks still depends on your content and your competition.</p></details>
          <details><summary>Does it write content or build backlinks?</summary>
            <p>No. It doesn&apos;t generate articles or join link networks, the things search engines&apos; spam policies
              warn about. It works on the pages you already have.</p></details>
          <details><summary>Is it safe with Google?</summary>
            <p>Yes. It uses standard, documented methods: sitemaps, robots.txt, schema.org structured data and IndexNow
              notifications. Google doesn&apos;t use IndexNow, so for Google you submit your sitemap once in Search Console.</p></details>
          <details><summary>Does it work with my site builder?</summary>
            <p>Sites that build to HTML (Next.js, Astro, Hugo, Eleventy, plain HTML) work today, including Next.js without
              static export. Single-page apps (Vite, Bolt, Create React App) work through <code>knownsite prerender</code>.
              Run the free check first to see where you stand.</p></details>
          <details><summary>What does it cost?</summary>
            <p>The tool and the standard are free and open source. Paid plans add weekly tracking of what ChatGPT, Claude,
              Perplexity and Gemini say about you. <Link href="/pricing">See plans</Link>.</p></details>
          <details><summary>Do you collect my site&apos;s data?</summary>
            <p>The tool runs inside your own build; nothing is sent to us. The online check reads your public pages the
              way crawlers do and doesn&apos;t keep anything about you. Paid plans only see what you connect.</p></details>
        </div>
      </section>

      <section className="section about">
        <p className="eyebrow" style={{ marginTop: 0 }}>Who&apos;s behind it</p>
        <p>Knownsite is built by <strong>WellnessLabs</strong>, a small team that builds and runs its own sites, and kept
          finding that search engines and AI assistants couldn&apos;t read them. The standard and the tool are open, so
          any platform can adopt them. Questions? <a href="mailto:sales@knownsite.dev">sales@knownsite.dev</a></p>
      </section>

      <div className="cta-band">
        <h2>Does ChatGPT recommend you?</h2>
        <p>Track what ChatGPT, Claude, Perplexity and Gemini say about you every week, which competitors they name
          instead, and what to change.</p>
        <div className="actions" style={{ marginBottom: 0 }}>
          <Link href="/pricing" className="btn">See plans <span className="arrow">→</span></Link>
        </div>
      </div>
    </>
  );
}
