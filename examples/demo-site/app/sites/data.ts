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
