// Directory and study data, measured by KnownsiteBot (services/directory, private) and saved in
// data/*.json. Read at build time; a missing file means an empty directory, not a failed build.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Allow = Record<string, boolean>;
export type Robots = { found: boolean; status: number; aiSearch: Allow; search: Allow; training: Allow; sitemaps: number };
export type Platform = { builder: string | null; host: string | null; framework: string | null; cdn: string | null };
export type Site = {
  host: string; checkedAt: string; reachable: boolean; error?: string; optedOut?: boolean; blocked?: boolean;
  url?: string; status?: number; title?: string | null; description?: string | null; noindex?: boolean | null; words?: number | null;
  jsonLd?: boolean | null; robots: Robots | null; llmsTxt?: boolean; sitemap?: { found: boolean; entries: number; listedInRobots: boolean };
  knownsiteLevel?: number; platform?: Platform; ours?: boolean; rank?: number; html?: boolean; website?: boolean; name?: string; products?: string[];
};
export type Category = { slug: string; name: string; description: string; sites: Site[] };
export type Directory = { generatedAt: string; categories: Category[] };
export type Study = { generatedAt: string; list: string; top: number; sites: Site[] };

function load<T>(file: string, empty: T): T {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'data', file), 'utf8')) as T;
  } catch {
    return empty;
  }
}

export const directory = (): Directory => load('directory.json', { generatedAt: '', categories: [] });
export const study = (): Study | null => load<Study | null>('study.json', null);

/** Sites we list: reachable and not opted out of KnownsiteBot. Alphabetical, ours included. */
export const listed = (c: Category) => c.sites.filter((s) => s.reachable && !s.optedOut).sort((a, b) => a.host.localeCompare(b.host));

/** A site and every category it's listed in (Zoho is in accounting, meetings and word processors). */
export function findSite(host: string): { site: Site; category: Category; categories: Category[] } | null {
  const categories = directory().categories.filter((c) => listed(c).some((s) => s.host === host));
  if (!categories.length) return null;
  return { site: listed(categories[0]).find((s) => s.host === host)!, category: categories[0], categories };
}

/** Every host in the directory, once. */
export const allHosts = () => [...new Set(directory().categories.flatMap((c) => listed(c).map((s) => s.host)))];

export const AI_SEARCH_BOTS: [string, string][] = [['OAI-SearchBot', 'ChatGPT search'], ['Claude-SearchBot', 'Claude'], ['PerplexityBot', 'Perplexity']];
export const SEARCH_BOTS: [string, string][] = [['Googlebot', 'Google Search'], ['Bingbot', 'Bing (also feeds ChatGPT and Copilot)']];
export const TRAINING_BOTS: [string, string][] = [
  ['GPTBot', 'OpenAI training'], ['ClaudeBot', 'Anthropic training'], ['Google-Extended', 'Gemini training'],
  ['Applebot-Extended', 'Apple training'], ['CCBot', 'Common Crawl'], ['Meta-ExternalAgent', 'Meta training'],
];

// US Pacific, where the measurements run: a run on a Tuesday evening is dated Tuesday.
export const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }) : '';

/** Short summary of AI search access, e.g. "3 of 3 allowed". */
export function aiSearchSummary(s: Site) {
  if (!s.robots) return 'Unknown';
  const n = AI_SEARCH_BOTS.filter(([t]) => s.robots!.aiSearch[t]).length;
  return `${n} of ${AI_SEARCH_BOTS.length} allowed`;
}

export function textSummary(s: Site) {
  if (s.blocked) return 'Not measured: the site refused our checker';
  if (s.words == null) return 'Unknown';
  return `${s.words.toLocaleString('en-US')} words`;
}

export const platformLine = (p?: Platform) =>
  p ? [p.builder && `built with ${p.builder}`, p.framework && `${p.framework}`, p.host && `hosted on ${p.host}`, p.cdn && `behind ${p.cdn}`].filter(Boolean).join(', ') : '';

// ---------- plain language, for readers who aren't developers ----------

const BOT_COMPANY: Record<string, string> = { 'OAI-SearchBot': 'ChatGPT', 'Claude-SearchBot': 'Claude', PerplexityBot: 'Perplexity' };
const TRAINER: Record<string, string> = {
  GPTBot: 'OpenAI', ClaudeBot: 'Anthropic', 'Google-Extended': 'Google', 'Applebot-Extended': 'Apple', CCBot: 'Common Crawl', 'Meta-ExternalAgent': 'Meta',
};
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export type Verdict = 'good' | 'partly' | 'poor' | 'unknown';

/** One-line answer to "can AI assistants read this site?" */
export function verdict(s: Site): { level: Verdict; headline: string } {
  if (!s.robots) return { level: 'unknown', headline: 'We couldn’t check this site' };
  const allowed = AI_SEARCH_BOTS.filter(([t]) => s.robots!.aiSearch[t]).length;
  if (allowed === 0 || s.noindex) return { level: 'poor', headline: 'Hard for AI assistants to find' };
  if (!s.blocked && (s.words ?? 0) < 50) return { level: 'poor', headline: 'AI assistants see an almost empty page' };
  if (allowed === AI_SEARCH_BOTS.length && !s.blocked && (s.words ?? 0) >= 200) return { level: 'good', headline: 'Easy for AI assistants to read' };
  return { level: 'partly', headline: 'Partly readable by AI assistants' };
}

/** Plain sentences behind the verdict. */
export function plainFacts(s: Site): string[] {
  if (!s.robots) return ['The site didn’t answer when we checked, so there’s nothing to report yet.'];
  const out: string[] = [];
  const ok = AI_SEARCH_BOTS.filter(([t]) => s.robots!.aiSearch[t]).map(([t]) => BOT_COMPANY[t]);
  const no = AI_SEARCH_BOTS.filter(([t]) => !s.robots!.aiSearch[t]).map(([t]) => BOT_COMPANY[t]);
  if (!no.length) out.push('ChatGPT, Claude and Perplexity are all allowed to read it.');
  else if (!ok.length) out.push('It tells ChatGPT, Claude and Perplexity not to read it, so they can’t quote or link to it.');
  else out.push(`${list(ok)} ${ok.length > 1 ? 'are' : 'is'} allowed to read it; ${list(no)} ${no.length > 1 ? 'are' : 'is'} told to stay out.`);
  if (s.blocked) out.push('It turns away automated visitors it doesn’t recognise, so newer or smaller AI tools may not get in.');
  else if (s.words != null && s.words < 50) out.push('Its homepage shows almost no text until it runs extra code, so many AI tools see a nearly empty page.');
  else if (s.words != null && s.words < 200) out.push(`AI tools can read only a little of its homepage (${s.words} words) without running extra code.`);
  else if (s.words != null) out.push(`AI tools can read its homepage text (${s.words.toLocaleString('en-US')} words) without running extra code.`);
  const trainBlocked = TRAINING_BOTS.filter(([t]) => s.robots!.training[t] === false).map(([t]) => TRAINER[t]);
  out.push(trainBlocked.length
    ? `It doesn’t let ${list(trainBlocked)} use its content to train AI models. That doesn’t stop AI assistants from citing it.`
    : 'It lets AI companies use its content to train their models.');
  if (s.noindex) out.push('Its homepage asks search engines to leave it out of their results.');
  return out;
}

/** Short cell text for tables: "All 3", "2 of 3", "None". */
export function assistantsAllowed(s: Site) {
  if (!s.robots) return 'Unknown';
  const n = AI_SEARCH_BOTS.filter(([t]) => s.robots!.aiSearch[t]).length;
  return n === AI_SEARCH_BOTS.length ? 'All 3' : n === 0 ? 'None' : `${n} of 3`;
}

export function homepageReadable(s: Site) {
  if (s.blocked) return 'Turns away bots';
  if (s.words == null) return 'Unknown';
  return s.words >= 200 ? 'Yes' : s.words >= 50 ? 'A little' : 'Almost empty';
}
