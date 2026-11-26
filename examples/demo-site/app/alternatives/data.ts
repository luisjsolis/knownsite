// Alternatives data (data/alternatives.json) and the rule for which pages are published.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Product = {
  host?: string; name: string; category: string; checked?: string; does?: string; cells?: string[]; sources?: string[];
  ours?: boolean; unchecked?: boolean; uncheckedWhy?: string;
};
export type CoMentions = { asked: number; named: number; engines: string; date: string; counts: Record<string, number> };
export type AltPage = { host: string; alternatives: string[]; coMentions?: CoMentions };
export type Data = { categories: Record<string, { name: string; columns: string[] }>; products: Record<string, Product>; pages: AltPage[] };

export const data = (): Data => JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'alternatives.json'), 'utf8'));

/** A product key is its host, or host#category for a site listed in a second category. */
export const hostOf = (key: string, d: Data) => d.products[key]?.host || key.split('#')[0];

/** Published only with checked facts for the tool itself and at least 3 alternatives (no thin pages). */
export const MIN_CHECKED = 3;
export const publishable = (page: AltPage, d: Data) =>
  !d.products[page.host]?.unchecked && page.alternatives.filter((k) => d.products[k] && !d.products[k].unchecked).length >= MIN_CHECKED;

/** Hosts of every published alternatives page. */
export const publishedPages = (d: Data = data()) => d.pages.filter((p) => publishable(p, d));
