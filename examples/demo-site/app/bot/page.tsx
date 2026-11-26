import Link from 'next/link';
import { pageMeta, SALES_EMAIL } from '../meta';

export const metadata = pageMeta('/bot', 'KnownsiteBot',
  'What KnownsiteBot fetches, how often, and how to block it.');

export default function Bot() {
  return (
    <>
      <p className="eyebrow">Crawler</p>
      <h1>KnownsiteBot</h1>
      <p className="lede">
        KnownsiteBot measures what search engines and AI crawlers can read on a site, for the <Link href="/sites">Knownsite directory</Link> and
        the <Link href="/study/ai-crawler-access">AI crawler access study</Link>.
      </p>
      <h2>What it fetches</h2>
      <ul>
        <li>robots.txt first. If robots.txt disallows KnownsiteBot, nothing else is fetched.</li>
        <li>Then the homepage, /llms.txt, the sitemap and /.well-known/discovery.json: about six requests per site.</li>
        <li>One request at a time, at least one second apart, about once a week.</li>
        <li>It never logs in, submits forms, runs JavaScript or follows links beyond these files.</li>
        <li>It never pretends to be another crawler. It always sends:<br />
          <code>Mozilla/5.0 (compatible; KnownsiteBot/1.0; +https://knownsite.dev/bot)</code></li>
      </ul>
      <h2>How to block it</h2>
      <pre><code>{'User-agent: KnownsiteBot\nDisallow: /'}</code></pre>
      <p>A site that blocks it is left out of the directory and the study. To have a listing removed, email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>; removals are done within 7 days.</p>
    </>
  );
}
