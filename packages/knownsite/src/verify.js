// `knownsite verify`: check a live site the way a receiver would. SPEC.md §4, §9.
import { resolveTxt } from 'node:dns/promises';
import { PATHS, parseRecords } from './build.js';
import { verifyObject } from './sign.js';

export async function lookupDnsKeys(host, resolve = resolveTxt) {
  try {
    const rows = await resolve(`_knownsite.${host}`);
    return rows
      .map((chunks) => chunks.join(''))
      .map((txt) => Object.fromEntries(txt.split(';').map((p) => p.trim().split('=')).filter((kv) => kv.length === 2)))
      .filter((k) => k.kid && k.pub);
  } catch {
    return [];
  }
}

export async function verifySite(site, { fetchImpl = fetch, resolve = resolveTxt } = {}) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
  const get = async (url) => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };

  const manifestText = await get(`${site}/${PATHS.manifest}`);
  let manifest;
  try {
    manifest = manifestText === null ? null : JSON.parse(manifestText);
  } catch {
    manifest = null;
  }
  if (!manifest || typeof manifest !== 'object') {
    check('manifest', false, `${site}/${PATHS.manifest} missing or not JSON`);
    return { site, level: 0, checks };
  }
  check('manifest', manifest.site === site, manifest.site === site ? `Knownsite ${manifest.knownsite}` : `manifest.site is ${manifest.site}`);

  const sitemap = await get(manifest.sitemap ?? `${site}/sitemap.xml`);
  check('sitemap', Boolean(sitemap?.includes('<urlset')), manifest.sitemap);
  const lastDeploy = await get(`${site}/${PATHS.lastDeploy}`);
  check('change list', Boolean(lastDeploy), `${site}/${PATHS.lastDeploy}`);
  const level1 = checks.every((c) => c.ok);

  // Level 2: a key proven by well-known file or DNS, and every record signed by it.
  const host = new URL(site).hostname;
  const dnsKeys = await lookupDnsKeys(host, resolve);
  const keys = new Map([...(manifest.keys ?? []), ...dnsKeys].map((k) => [k.kid, k.pub]));
  check('signing key', keys.size > 0,
    keys.size ? `${manifest.keys?.length ?? 0} in well-known file, ${dnsKeys.length} in DNS (_knownsite.${host})` : 'none published');

  const recordsText = await get(manifest.records ?? `${site}/${PATHS.records}`);
  let records = [];
  try {
    records = recordsText ? parseRecords(recordsText) : [];
  } catch {
    check('records', false, 'records.jsonl is not valid JSON lines');
  }
  const foreign = records.filter((r) => { try { return new URL(r.url).origin !== site; } catch { return true; } });
  check('records on host', records.length > 0 && foreign.length === 0,
    foreign.length ? `${foreign.length} records point off-site` : `${records.length} records`);
  const valid = records.filter((r) => keys.has(r.kid) && verifyObject(r, keys.get(r.kid)));
  check('record signatures', records.length > 0 && valid.length === records.length, `${valid.length}/${records.length} valid`);

  const level2 = level1 && checks.every((c) => c.ok);
  return { site, level: level2 ? 2 : level1 ? 1 : 0, checks };
}
