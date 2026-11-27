import type { Metadata } from 'next';

// The site's public address. Set KNOWNSITE_SITE at build (deploy:firebase does) so canonical links,
// Open Graph URLs and Knownsite's records all agree; moving to a new domain is this one value.
export const SITE =
  process.env.KNOWNSITE_SITE ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://knownsite.dev');

// app/opengraph-image.tsx, generated at build. Listed explicitly: a page that sets its own openGraph
// does not inherit the file-based image.
const OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, type: 'image/png',
  alt: 'Knownsite: get your site found by search engines and AI assistants' };

/** Public contact for sales and support (a role address, fine to publish). */
export const SALES_EMAIL = 'sales@knownsite.dev';

/** Title, description, canonical link and Open Graph tags for one page. */
export function pageMeta(path: string, title: string, description: string, opts: { absoluteTitle?: boolean; json?: string } = {}): Metadata {
  return {
    title: opts.absoluteTitle ? { absolute: title } : title,
    description,
    // json: the same facts for machines (/api/v1/...), as <link rel="alternate" type="application/json">.
    alternates: { canonical: path, ...(opts.json && { types: { 'application/json': opts.json } }) },
    openGraph: { type: 'website', siteName: 'Knownsite', url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}
