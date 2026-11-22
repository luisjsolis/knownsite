import { pageMeta } from '../meta';
import Checker from './checker';
import Recommend from './recommend';

export const metadata = pageMeta('/check', 'Can search engines and AI assistants find your site?',
  'Free check: what Google, Bing, ChatGPT, Claude and Perplexity crawlers actually get from your site, scored 0 to 100, with the fix for each problem.');

export default function CheckPage() {
  return (
    <>
      <h1>Can search engines and AI assistants find your site?</h1>
      <p className="lede">See what Google, Bing, ChatGPT, Claude and Perplexity actually get when they visit
        your homepage, scored from 0 to 100, with the fix for each problem.</p>
      <Recommend api={process.env.NEXT_PUBLIC_CHECK_API ?? ''} engine={process.env.NEXT_PUBLIC_SAMPLE_ENGINE ?? 'ChatGPT'} />
      <h2>Free technical check</h2>
      <Checker api={process.env.NEXT_PUBLIC_CHECK_API ?? ''} />
      <p className="muted">The check reads your homepage, robots.txt, sitemap and llms.txt the way each crawler
        would: public pages only, a few requests, nothing stored about you. Same check from your terminal:{' '}
        <code>npx knownsite check your-site.com</code></p>
    </>
  );
}
