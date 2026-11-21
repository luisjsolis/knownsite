#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile, access } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, normalizeSite, CONFIG_FILE, DEFAULTS } from './config.js';
import { build } from './build.js';
import { notify } from './notify.js';
import { verifySite } from './verify.js';
import { checkSite, rankFixes } from './check.js';
import { generateKeys, loadPrivateKey } from './sign.js';
import { fetchPreviousRecords } from './build.js';
import { buildReport, renderReport, loadVisits, loadNotifications, HISTORY_FILE } from './report.js';

const HELP = `knownsite — Knownsite Protocol CLI

Usage:
  knownsite init   [--site URL] [--out-dir DIR] [--force]   Create keys and knownsite.config.json
  knownsite build  [--site URL] [--out-dir DIR] [--offline] Run after your framework build
  knownsite notify [--site URL] [--deploy ID] [--wait SEC] [--dry-run] [--json] [--strict]
                                                       Run after the deploy is live
  knownsite verify [url] [--json]                            Check a live site like a receiver would
  knownsite check  <url> [--json]                            Score how findable any live site is by
                                                       search engines and AI assistants
  knownsite report [--site URL] [--visits FILE|URL] [--visits-header "Name: value"] [--days N] [--json]
                                                       What changed, when engines were told, which
                                                       crawlers came back, visitors from AI answers

Environment:
  KNOWNSITE_PRIVATE_KEY   signing key (else .knownsite/private.key); without it output is unsigned (Level 1)
  KNOWNSITE_SITE          site URL (else knownsite.config.json "site", else VERCEL_PROJECT_PRODUCTION_URL)
  KNOWNSITE_VISITS        default for --visits
`;

const exists = (p) => access(p).then(() => true, () => false);
const mark = (ok) => (ok === true ? '✓' : ok === false ? '✗' : '•');

async function cmdInit(cwd, v) {
  const configPath = path.join(cwd, CONFIG_FILE);
  const keyPath = path.join(cwd, '.knownsite', 'private.key');
  if (!v.force && ((await exists(configPath)) || (await exists(keyPath)))) {
    throw new Error(`${CONFIG_FILE} or .knownsite/private.key already exists. Use --force to replace (this rotates your key).`);
  }
  const site = v.site ? normalizeSite(v.site) : 'https://example.com';
  const { privateKey, publicKey } = generateKeys();
  const config = {
    site,
    outDir: v['out-dir'] ?? DEFAULTS.outDir,
    keys: [{ kid: 'k1', alg: 'Ed25519', pub: publicKey }],
    indexnow: { key: randomBytes(16).toString('hex') },
    terms: DEFAULTS.terms,
    receivers: [],
  };
  await mkdir(path.dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${privateKey}\n`, { mode: 0o600 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const gitignore = path.join(cwd, '.gitignore');
  const current = (await readFile(gitignore, 'utf8').catch(() => '')) ?? '';
  if (!/^\.knownsite\/?$/m.test(current)) await appendFile(gitignore, `${current && !current.endsWith('\n') ? '\n' : ''}.knownsite/\n`);

  console.log(`Created ${CONFIG_FILE} and .knownsite/private.key (git-ignored).

Next:
  1. ${v.site ? '' : `Set "site" in ${CONFIG_FILE}. `}Add to your build script:  <framework build> && knownsite build
  2. Give your host the signing key, e.g. on Vercel:
       vercel env add KNOWNSITE_PRIVATE_KEY production < .knownsite/private.key
  3. After each deploy is live:  knownsite notify
  Optional, stronger ownership proof (DNS TXT record):
       _knownsite.${new URL(site).host}  "kid=k1; pub=${publicKey}"`);
}

async function cmdBuild(cwd, v) {
  const config = await loadConfig(cwd, { site: v.site, outDir: v['out-dir'] });
  const privateKey = await loadPrivateKey(cwd);
  const r = await build({ cwd, config, privateKey, previousRecords: v.offline ? [] : undefined });
  const { added, updated, removed } = r.changes;
  console.log(`knownsite build: ${r.records.length} pages for ${config.site} (${r.signed ? 'signed' : 'unsigned — set KNOWNSITE_PRIVATE_KEY for Level 2'})`);
  console.log(`  changes: ${added.length} added, ${updated.length} updated, ${removed.length} removed`);
  if (r.jsonLdInjected) console.log(`  JSON-LD added to ${r.jsonLdInjected} pages`);
  for (const s of r.skipped) console.log(`  skipped ${s.url} (${s.reason})`);
  for (const w of r.warnings ?? []) console.warn(`  ⚠ ${w}`);
  console.log(`  wrote: ${r.written.join(', ')}`);
}

async function cmdNotify(cwd, v) {
  const config = await loadConfig(cwd, { site: v.site });
  const privateKey = await loadPrivateKey(cwd);
  const report = await notify({
    config, privateKey, dryRun: v['dry-run'],
    expectDeploy: v.deploy, waitSeconds: v.wait ? Number(v.wait) : v.deploy ? 120 : 0,
  });
  await mkdir(path.join(cwd, '.knownsite'), { recursive: true });
  await writeFile(path.join(cwd, '.knownsite', 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  // History for `knownsite report`: when each change was announced, and to whom. Kept next to
  // knownsite.config.json (not in the git-ignored .knownsite/) so it is committed with the site.
  if (!v['dry-run'] && report.engines.length) {
    const { at, deploy, changes, engines } = report;
    await appendFile(path.join(cwd, HISTORY_FILE), `${JSON.stringify({ at, deploy, changes, engines })}\n`);
  }
  if (v.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { added, updated, removed } = report.changes;
    console.log(`knownsite notify: ${config.site}  deploy ${report.deploy.id}`);
    console.log(`  changes: ${added.length} added, ${updated.length} updated, ${removed.length} removed`);
    if (report.note) console.log(`  ${report.note}`);
    for (const e of report.engines) console.log(`  ${mark(e.ok)} ${e.engine}  via ${e.via}: ${e.detail}`);
    console.log(`  report saved to .knownsite/report.json; history in ${HISTORY_FILE} (commit it)`);
  }
  if (v.strict && report.engines.some((e) => e.ok === false)) process.exitCode = 1;
}

async function cmdVerify(cwd, v, args) {
  const given = v.site ?? args[0];
  const site = given ? normalizeSite(/^https?:\/\//.test(given) ? given : `https://${given}`) : (await loadConfig(cwd)).site;
  const result = await verifySite(site);
  if (v.json) return console.log(JSON.stringify(result, null, 2));
  console.log(`knownsite verify: ${site}  →  Level ${result.level}`);
  for (const c of result.checks) console.log(`  ${mark(c.ok)} ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
  if (result.level === 0) process.exitCode = 1;
}

const BANDS = { discoverable: 'Discoverable', 'partly-visible': 'Partly visible', 'mostly-invisible': 'Mostly invisible', unreachable: 'Unreachable' };
const ICON = { pass: '✓', fail: '✗', warn: '!', unknown: '?' };

async function cmdCheck(cwd, v, args) {
  if (!args[0]) throw new Error('usage: knownsite check <url>');
  const r = await checkSite(args[0]);
  if (v.json) return console.log(JSON.stringify(r, null, 2));
  console.log(`knownsite check: ${r.url}\n\n  ${r.score}/100  ${BANDS[r.band]}`);
  for (const c of r.critical) console.log(`  ✗ ${c}`);
  for (const n of r.notes ?? []) console.log(`  • ${n}`);
  if (r.band === 'unreachable') return void (process.exitCode = 1);
  console.log('\n  Search & AI crawlers');
  for (const c of r.crawlers) console.log(`    ${ICON[c.status]} ${c.token.padEnd(17)} ${c.who}: ${c.message}`);
  const blocked = r.training.filter((t) => !t.allowed).map((t) => t.token);
  console.log(`    • Training crawlers (not scored): ${blocked.length ? `blocks ${blocked.join(', ')}` : 'all allowed'}`);
  console.log('\n  Checks');
  for (const c of r.checks.filter((c) => c.group !== 'crawlers')) {
    console.log(`    ${ICON[c.status]} ${String(c.points).padStart(2)}/${String(c.max).padEnd(2)} ${c.message}`);
  }
  const fixes = rankFixes(r);
  if (fixes.length) {
    console.log('\n  Fixes (most points first)');
    fixes.forEach((f, i) => console.log(`    ${i + 1}. ${f.gain ? `+${f.gain} ` : ''}${f.fix}`));
  }
  console.log('\n  Fix all of this on every deploy: npx knownsite init');
}

async function cmdReport(cwd, v, args) {
  const given = v.site ?? args[0];
  const site = given ? normalizeSite(/^https?:\/\//.test(given) ? given : `https://${given}`) : (await loadConfig(cwd)).site;
  const records = await fetchPreviousRecords(site);
  if (!records.length) console.error(`knownsite report: no signed records found at ${site} (is \`knownsite build\` output deployed?)`);
  const notifications = await loadNotifications(cwd);
  const source = v.visits ?? process.env.KNOWNSITE_VISITS;
  const headers = Object.fromEntries((v['visits-header'] ?? []).map((h) => {
    const i = h.indexOf(':');
    if (i < 1) throw new Error(`--visits-header must look like "Name: value", got: ${h}`);
    return [h.slice(0, i).trim(), h.slice(i + 1).trim()];
  }));
  const visits = source ? await loadVisits(source, { headers }) : [];
  const report = buildReport({ site, records, notifications, visits, days: v.days ? Number(v.days) : 30 });
  console.log(v.json ? JSON.stringify(report, null, 2) : renderReport(report));
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      site: { type: 'string' }, 'out-dir': { type: 'string' }, deploy: { type: 'string' }, wait: { type: 'string' },
      force: { type: 'boolean' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
      json: { type: 'boolean' }, strict: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      visits: { type: 'string' }, 'visits-header': { type: 'string', multiple: true }, days: { type: 'string' },
    },
  });
  const commands = { init: cmdInit, build: cmdBuild, notify: cmdNotify, verify: cmdVerify, check: cmdCheck, report: cmdReport };
  const cmd = commands[positionals[0]];
  if (!cmd || values.help) {
    console.log(HELP);
    if (!values.help && positionals[0]) process.exitCode = 1;
    return;
  }
  await cmd(process.cwd(), values, positionals.slice(1));
}

main().catch((err) => {
  console.error(`knownsite: ${err.message}`);
  process.exitCode = 1;
});
