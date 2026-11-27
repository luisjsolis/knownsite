// The machine-readable side of the alternatives pages: one JSON file per checked tool, per category,
// and an index, built from the same data/alternatives.json and data/directory.json as the pages.
// Every fact carries the quote and page it came from, so an AI answer can cite the company directly.
import { SITE } from '../../meta';
import { data, hostOf, isChecked, publishedPages, type Data, type Product } from '../../alternatives/data';
import { findSite, AI_SEARCH_BOTS, type Site } from '../../sites/data';

export const API = '/api/v1';
export const LICENSE = {
  name: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Knownsite (knownsite.dev)',
};
/** Facts older than this should be checked on the company's own page before being repeated. */
export const RECHECK_DAYS = 45;
const NOT_SHOWN = 'Not shown';

/** File name for a product key: host#category becomes host_category (hosts never contain "_"). */
export const fileKey = (key: string) => key.replace('#', '_');
export const toolJson = (key: string) => `${API}/tools/${fileKey(key)}.json`;
export const categoryJson = (slug: string) => `${API}/categories/${slug}.json`;
const abs = (p: string) => `${SITE}${p}`;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

/** Every tool with a JSON file: checked, and on at least one published page (as the subject or a row). */
export function apiTools(d: Data = data()): string[] {
  const keys = new Set<string>();
  for (const p of publishedPages(d)) for (const k of [p.host, ...p.alternatives]) if (isChecked(d.products[k])) keys.add(k);
  return [...keys].sort();
}

/** A tool's alternatives: its own page's list if it has one, else the other tools in its category. */
function alternativesOf(key: string, d: Data, tools: string[]) {
  const own = publishedPages(d).find((p) => p.host === key);
  const keys = own ? own.alternatives.filter((k) => tools.includes(k))
    : tools.filter((k) => k !== key && d.products[k].category === d.products[key].category);
  return keys.map((k) => ({ key: k, name: d.products[k].name, json: abs(toolJson(k)) }));
}

function aiAccess(s: Site | undefined) {
  if (!s?.robots) return null;
  const company: Record<string, string> = { 'OAI-SearchBot': 'chatgpt', 'Claude-SearchBot': 'claude', PerplexityBot: 'perplexity' };
  return {
    checked: s.checkedAt.slice(0, 10),
    aiSearchAllowed: Object.fromEntries(AI_SEARCH_BOTS.map(([t]) => [company[t], Boolean(s.robots!.aiSearch[t])])),
    homepageWordsWithoutJavaScript: s.blocked ? null : s.words ?? null,
    turnsAwayUnknownBots: Boolean(s.blocked),
    sitemap: Boolean(s.sitemap?.found),
    llmsTxt: Boolean(s.llmsTxt),
    signedKnownsiteRecord: (s.knownsiteLevel ?? 0) >= 2,
    page: abs(`/sites/${s.host}`),
  };
}

export function toolRecord(key: string, d: Data = data(), tools = apiTools(d)) {
  const p: Product = d.products[key];
  const cat = d.categories[p.category];
  const host = hostOf(key, d);
  const recheckBy = addDays(p.checked!, RECHECK_DAYS);
  const ownPage = publishedPages(d).find((pg) => pg.host === key);
  return {
    license: LICENSE,
    key,
    name: p.name,
    host,
    url: `https://${host}/`,
    category: { slug: p.category, name: cat.name, json: abs(categoryJson(p.category)) },
    does: p.does ?? null,
    checked: p.checked,
    recheckBy,
    stale: today() > recheckBy,
    facts: cat.columns.map((field, i) => {
      const value = p.cells?.[i];
      if (!value || value === NOT_SHOWN) return { field, value: null, status: 'not_shown' };
      const e = p.evidence?.[i];
      return { field, value, quote: e?.quote ?? null, source: e?.source ?? null };
    }),
    sources: p.sources ?? [],
    alternatives: alternativesOf(key, d, tools),
    namedTogetherByAI: ownPage?.coMentions ? {
      questionsAsked: ownPage.coMentions.asked,
      engines: ownPage.coMentions.engines.split(/, | and /),
      date: ownPage.coMentions.date,
      timesNamed: ownPage.coMentions.counts,
    } : null,
    aiAccess: aiAccess(findSite(host)?.site),
    claimed: false,
    ours: Boolean(p.ours),
    pages: {
      alternatives: ownPage ? abs(`/alternatives/${key}`) : null,
      site: findSite(host) ? abs(`/sites/${host}`) : null,
    },
  };
}

export function categoryRecord(slug: string, d: Data = data(), tools = apiTools(d)) {
  const c = d.categories[slug];
  return {
    license: LICENSE,
    slug,
    name: c.name,
    description: c.description ?? null,
    fields: c.columns,
    tools: tools.filter((k) => d.products[k].category === slug).map((k) => ({
      key: k, name: d.products[k].name, checked: d.products[k].checked, json: abs(toolJson(k)),
    })),
    page: abs(`/sites/${slug}`),
  };
}

export const apiCategories = (d: Data = data(), tools = apiTools(d)) =>
  [...new Set(tools.map((k) => d.products[k].category))].sort();

export function indexRecord(d: Data = data()) {
  const tools = apiTools(d);
  return {
    license: LICENSE,
    about: 'Software tools compared on facts from each company\'s own pages. Every fact has the quote and page it came '
      + 'from and the date it was checked. Not shown means the company\'s pages don\'t say; we never guess. No paid placement. '
      + `Facts older than ${RECHECK_DAYS} days are marked stale: check the source page before repeating them.`,
    docs: abs('/api'),
    generated: today(),
    categories: apiCategories(d, tools).map((s) => ({ slug: s, name: d.categories[s].name, json: abs(categoryJson(s)) })),
    tools: tools.map((k) => ({ key: k, name: d.products[k].name, category: d.products[k].category, checked: d.products[k].checked, json: abs(toolJson(k)) })),
  };
}

/** The tool JSON for a host's /sites page, when exactly one tool lives on that host. */
export function toolJsonForHost(host: string, d: Data = data()) {
  const keys = apiTools(d).filter((k) => hostOf(k, d) === host);
  return keys.length === 1 ? toolJson(keys[0]) : undefined;
}
