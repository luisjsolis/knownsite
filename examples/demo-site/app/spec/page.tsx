import { pageMeta } from '../meta';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

export const metadata = pageMeta('/spec', 'Specification', 'The Knownsite Protocol, draft 0.1: site manifest, ownership verification, deploy notifications, signed content records and usage terms.');

// Rendered at build time from the repo's SPEC.md, so the site and the spec never drift apart.
const html = marked.parse(readFileSync(path.join(process.cwd(), '..', '..', 'SPEC.md'), 'utf8'), { async: false });

export default function Spec() {
  return <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
