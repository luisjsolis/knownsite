import { pageMeta } from '../meta';

export const metadata = pageMeta('/how-it-works', 'How it works', 'What happens on every deploy: generate discovery files, sign content records, notify engines.');

export default function HowItWorks() {
  return (
    <>
      <h1>How it works</h1>
      <p className="lede">Two commands, added to the build and deploy you already have.</p>

      <h2>1. On build: <code>knownsite build</code></h2>
      <p>Runs over the framework&apos;s output and writes:</p>
      <ul>
        <li><code>sitemap.xml</code> and a <code>robots.txt</code> that points to it</li>
        <li><code>llms.txt</code>, a plain summary AI assistants can read</li>
        <li>schema.org JSON-LD in each page</li>
        <li><code>/.well-known/discovery.json</code>, the site&apos;s public key and usage terms</li>
        <li>one signed content record per page, with a hash of its text</li>
      </ul>

      <h2>2. After deploy: <code>knownsite notify</code></h2>
      <p>Sends only the URLs that changed to IndexNow (Bing, Yandex, Naver, Seznam, Yep) and to any
        Knownsite receivers, as a notification signed with the site&apos;s key.</p>

      <h2>Proving ownership</h2>
      <p>The site publishes its public key in <code>/.well-known/discovery.json</code>, or, for stronger proof,
        in a DNS TXT record. Receivers check every signature against it.</p>

      <pre>{`npx knownsite init --site https://your-site.com
next build && knownsite build
knownsite notify`}</pre>
    </>
  );
}
