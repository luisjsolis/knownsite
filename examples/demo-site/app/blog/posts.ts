export type Post = { slug: string; title: string; date: string; summary: string; body: string[] };

export const posts: Post[] = [
  {
    slug: 'introducing-knownsite',
    title: 'Introducing Knownsite',
    date: '2026-11-09',
    summary: 'A draft open standard for announcing a website to search engines and AI assistants at deploy time.',
    body: [
      'Today we are publishing draft 0.1 of the Knownsite Protocol: a small, open format a website uses to announce itself and its changes, once, when it deploys.',
      'It builds on what already works — sitemaps, IndexNow, schema.org and llms.txt — and adds two things: a content record the site owner signs, and usage terms the owner declares.',
      'The specification is published under CC BY 4.0 and the reference implementation is MIT licensed. Anyone can implement it.',
    ],
  },
  {
    slug: 'why-sign-content',
    title: 'Why sign your content?',
    date: '2026-11-09',
    summary: 'Signed content records let anyone confirm what a site actually published, and when.',
    body: [
      'When an AI assistant quotes your page, which version did it read? A signed content record answers that: it carries a hash of the page text, signed with a key only the site owner holds.',
      'Search engines and AI systems can check that what they crawled matches what you published, and citations can point to an exact version.',
    ],
  },
];
