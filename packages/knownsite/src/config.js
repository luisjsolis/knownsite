import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_FILE = 'knownsite.config.json';

export const DEFAULTS = {
  outDir: 'out',
  terms: { search: 'allow', 'ai-answer': 'allow-with-citation', training: 'deny' },
  keys: [],
  receivers: [],
  exclude: ['/404', '/500'],
  jsonld: true,
};

export function normalizeSite(site) {
  let url;
  try {
    url = new URL(site);
  } catch {
    throw new Error(`Invalid site URL: ${site}`);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error(`Site must use https: ${site}`);
  }
  return url.origin;
}

/** Site URL precedence: CLI flag > KNOWNSITE_SITE > config > Vercel production URL. */
export async function loadConfig(cwd, overrides = {}) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await readFile(path.join(cwd, CONFIG_FILE), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Could not read ${CONFIG_FILE}: ${err.message}`);
  }
  const config = { ...DEFAULTS, ...fileConfig };
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) config[k] = v;

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const site = overrides.site ?? process.env.KNOWNSITE_SITE ?? fileConfig.site ?? (vercelUrl && `https://${vercelUrl}`);
  if (!site) throw new Error(`No site URL. Set "site" in ${CONFIG_FILE}, KNOWNSITE_SITE, or pass --site.`);
  config.site = normalizeSite(site);
  return config;
}
