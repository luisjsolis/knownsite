// Client for a Knownsite collector: a service that keeps a site's crawler visits and notify history
// and serves its discovery report. The site registers by signing a challenge with its Knownsite key
// (the same key that signs its records), so no account is needed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { signObject } from './sign.js';

export const COLLECTOR_FILE = path.join('.knownsite', 'collector.json');

async function post(url, body, headers = {}, fetchImpl = fetch) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}${json.error ? ` (${json.error})` : ''}`);
  return json;
}

/** Register this site with a collector; returns { ingestToken, readToken }. */
export async function connectCollector({ collector, site, privateKey, kid, fetchImpl = fetch }) {
  const base = collector.replace(/\/$/, '');
  const ch = await post(`${base}/v1/register`, { site }, {}, fetchImpl);
  const signed = signObject(ch.sign, privateKey, kid);
  return post(`${base}/v1/register/verify`, { site, challenge: ch.challenge, kid: signed.kid, sig: signed.sig }, {}, fetchImpl);
}

/** Collector settings: environment first, then .knownsite/collector.json. Null if not connected. */
export async function collectorSettings(cwd) {
  let file = {};
  try {
    file = JSON.parse(await readFile(path.join(cwd, COLLECTOR_FILE), 'utf8'));
  } catch {
    // not connected from this machine
  }
  const collector = process.env.KNOWNSITE_COLLECTOR ?? file.collector;
  if (!collector) return null;
  return { collector: collector.replace(/\/$/, ''), ingestToken: process.env.KNOWNSITE_INGEST_TOKEN ?? file.ingestToken,
    readToken: process.env.KNOWNSITE_READ_TOKEN ?? file.readToken };
}

export async function saveCollectorSettings(cwd, settings) {
  await mkdir(path.join(cwd, '.knownsite'), { recursive: true });
  await writeFile(path.join(cwd, COLLECTOR_FILE), `${JSON.stringify(settings, null, 2)}\n`);
}

export async function sendNotification(settings, entry, fetchImpl = fetch) {
  return post(`${settings.collector}/v1/notifications`, entry, { authorization: `Bearer ${settings.ingestToken}` }, fetchImpl);
}

export async function fetchCollectorReport(settings, days, fetchImpl = fetch) {
  const res = await fetchImpl(`${settings.collector}/v1/report?days=${days}`, {
    headers: { authorization: `Bearer ${settings.readToken}` }, signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`collector report: HTTP ${res.status}${json.error ? ` (${json.error})` : ''}`);
  return json;
}
