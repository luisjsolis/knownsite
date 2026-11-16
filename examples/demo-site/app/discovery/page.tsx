import type { Metadata } from 'next';
import Report from './report';

export const metadata: Metadata = {
  title: 'Live discovery report',
  description: "This site's own Knownsite files, read live: manifest, latest deploy changes and signed content records.",
};

export default function DiscoveryPage() {
  return (
    <>
      <h1>Live discovery report</h1>
      <p className="lede">Read live from this site&apos;s published discovery files. What a search engine or AI
        assistant sees.</p>
      <Report />
    </>
  );
}
