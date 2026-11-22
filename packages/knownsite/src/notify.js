// `knownsite notify`: run once the deploy is live. Reads the change list that `knownsite build` published,
// pushes it to IndexNow and any Knownsite receivers, and returns a per-engine report. SPEC.md §5.
import { PATHS, PROTOCOL_VERSION } from './build.js';
import { signObject } from './sign.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const INDEXNOW_BATCH = 10_000;
const INDEXNOW_STATUS = {
  200: 'accepted',
  202: 'accepted (key validation pending)',
  400: 'bad request',
  403: 'key not valid (is the key file live?)',
  422: 'URLs do not belong to host',
  429: 'rate limited',
};
// Engines IndexNow fans out to; one ping covers all of them.
export const INDEXNOW_ENGINES = ['Bing', 'Yandex', 'Naver', 'Seznam', 'Yep'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch last-deploy.json from the live site; optionally wait until it reports `expectDeploy`. */
export async function fetchLastDeploy(site, { expectDeploy, waitSeconds = 0, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    let info;
    try {
      const res = await fetchImpl(`${site}/${PATHS.lastDeploy}`, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) info = await res.json();
    } catch {
      // fall through to retry
    }
    if (info && (!expectDeploy || info.deploy?.id === expectDeploy)) return info;
    if (Date.now() >= deadline) {
      throw new Error(
        info
          ? `Live site reports deploy ${info.deploy?.id}, expected ${expectDeploy}.`
          : `Could not read ${site}/${PATHS.lastDeploy}. Has \`knownsite build\` output been deployed?`,
      );
    }
    await sleep(3000);
  }
}

async function pingIndexNow({ site, key, urls, fetchImpl }) {
  const host = new URL(site).host;
  const results = [];
  for (let i = 0; i < urls.length; i += INDEXNOW_BATCH) {
    const urlList = urls.slice(i, i + INDEXNOW_BATCH);
    try {
      const res = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList }),
        signal: AbortSignal.timeout(15_000),
      });
      results.push({ ok: res.status === 200 || res.status === 202, status: res.status,
        detail: INDEXNOW_STATUS[res.status] ?? res.statusText });
    } catch (err) {
      results.push({ ok: false, status: 0, detail: err.message });
    }
  }
  return results.every((r) => r.ok)
    ? { ok: true, status: results.at(-1).status, detail: results.at(-1).detail }
    : results.find((r) => !r.ok);
}

async function pingReceiver({ receiver, payload, fetchImpl }) {
  const url = `${receiver.replace(/\/$/, '')}/knownsite/notify`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.status === 202 || res.ok, status: res.status, detail: res.statusText };
  } catch (err) {
    return { ok: false, status: 0, detail: err.message };
  }
}

/**
 * @returns {Promise<{site, deploy, changes, engines: Array<{engine, via, ok, status, detail}>}>}
 */
export async function notify({ config, privateKey, expectDeploy, waitSeconds = 0, dryRun = false, fetchImpl = fetch }) {
  const info = await fetchLastDeploy(config.site, { expectDeploy, waitSeconds, fetchImpl });
  const at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const { changes, deploy } = info;
  // IndexNow rejects a whole batch if any URL is on another host, so send only this site's URLs.
  const own = (u) => { try { return new URL(u).host === new URL(config.site).host; } catch { return false; } };
  const urls = [...changes.added, ...changes.updated, ...changes.removed].filter(own);
  const engines = [];
  const add = (engine, via, result) => engines.push({ engine, via, ...result });

  if (urls.length === 0) {
    return { site: config.site, at, deploy, changes, engines, note: 'No content changes in this deploy; nothing sent.' };
  }

  if (!config.indexnow?.key) {
    add(INDEXNOW_ENGINES.join(', '), 'IndexNow', { ok: false, status: 0, detail: 'skipped: no indexnow.key in knownsite.config.json' });
  } else if (dryRun) {
    add(INDEXNOW_ENGINES.join(', '), 'IndexNow', { ok: true, status: 0, detail: `dry run: would send ${urls.length} URLs` });
  } else {
    add(INDEXNOW_ENGINES.join(', '), 'IndexNow', await pingIndexNow({ site: config.site, key: config.indexnow.key, urls, fetchImpl }));
  }

  // Google does not support IndexNow and retired sitemap pings in 2023. Its Indexing API is limited
  // to job postings and livestreams. The sitemap is discoverable via robots.txt; Search Console
  // submission is a one-time manual step until Google offers an open push mechanism.
  add('Google', 'sitemap (robots.txt)', {
    ok: null, status: 0,
    detail: `manual, one time: submit ${config.site}/sitemap.xml in Google Search Console`,
  });

  const payload = { knownsite: PROTOCOL_VERSION, site: config.site, deploy, changes, records: `${config.site}/${PATHS.records}` };
  const signed = privateKey ? signObject(payload, privateKey, config.keys[0].kid) : payload;
  for (const receiver of config.receivers) {
    add(receiver, privateKey ? 'Knownsite (signed)' : 'Knownsite (unsigned)',
      dryRun ? { ok: true, status: 0, detail: 'dry run' } : await pingReceiver({ receiver, payload: signed, fetchImpl }));
  }

  return { site: config.site, at, deploy, changes, engines };
}
