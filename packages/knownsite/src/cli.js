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
import { visitsFromLogs } from './logs.js';
import { prerender, SHELL_FILE } from './prerender.js';
import { connectCollector, collectorSettings, saveCollectorSettings, sendNotification, fetchCollectorReport, COLLECTOR_FILE } from './collector.js';

const HELP = `knownsite — Knownsite Protocol CLI

Usage:
  knownsite init   [--site URL] [--out-dir DIR] [--force]   Create keys and knownsite.config.json
  knownsite prerender [--out-dir DIR] [--routes /a,/b] [--max N] [--no-crawl]
                                                       Single-page apps: render each page to real HTML
                                                       (needs Playwright in your project)
  knownsite build  [--site URL] [--out-dir DIR] [--offline] Run after your framework build
  knownsite notify [--site URL] [--deploy ID] [--wait SEC] [--dry-run] [--json] [--strict]
                                                       Run after the deploy is live
  knownsite verify [url] [--json]                            Check a live site like a receiver would
  knownsite check  <url> [--json]                            Score how findable any live site is by
                                                       search engines and AI assistants
  knownsite connect --collector URL                          Register this site with a collector (signed with
                                                       your key); notify and visit logging then send there
  knownsite report [url] [--from-collector] [--visits FILE|URL] [--visits-header "Name: value"] [--logs FILE] [--days N] [--json]
                                                       What changed, when engines were told, which
                                                       crawlers came back, visitors from AI answers

Environment:
  KNOWNSITE_PRIVATE_KEY   signing key (else .knownsite/private.key); without it output is unsigned (Level 1)
  KNOWNSITE_SITE          site URL (else knownsite.config.json "site", else VERCEL_PROJECT_PRODUCTION_URL)
  KNOWNSITE_VISITS        default for --visits

  --logs reads hosting access logs: Google Cloud Logging JSON (Firebase Hosting), Vercel log
  drains, Cloudflare Logpush, or nginx/Apache combined format. Repeatable.
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
  if (r.mode === 'next-server') {
    console.log(`  Next.js server mode: read prerendered pages from .next, wrote files to ${path.relative(cwd, r.outDir) || '.'}/`);
    if (r.appRoutes.length) console.log(`  kept the app's own ${r.appRoutes.join(', ')}`);
    if (r.jsonLdMissing) console.log(`  ${r.jsonLdMissing} pages have no JSON-LD; add it in your layout (server mode doesn't edit HTML)`);
    if (r.perRequest.length) console.log(`  not recorded (rendered per request, no HTML at build time): ${r.perRequest.slice(0, 8).join(', ')}${r.perRequest.length > 8 ? ', …' : ''}`);
    console.log(`  generated files in public/ are build output: add them to .gitignore (see README)`);
  }
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
  if (!v['dry-run'] && (report.engines.length || report.heldOut?.length)) {
    const { at, deploy, changes, engines, heldOut } = report;
    await appendFile(path.join(cwd, HISTORY_FILE), `${JSON.stringify({ at, deploy, changes, engines, heldOut })}\n`);
  }
  const col = v['dry-run'] || !(report.engines.length || report.heldOut?.length) ? null : await collectorSettings(cwd);
  if (col?.ingestToken) {
    const { at, deploy, changes, engines, heldOut } = report;
    await sendNotification(col, { at, deploy, changes, engines, heldOut })
      .then(() => { report.collector = 'sent'; })
      .catch((err) => { report.collector = `failed: ${err.message}`; });
  }
  if (v.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { added, updated, removed } = report.changes;
    console.log(`knownsite notify: ${config.site}  deploy ${report.deploy.id}`);
    console.log(`  changes: ${added.length} added, ${updated.length} updated, ${removed.length} removed`);
    if (report.note) console.log(`  ${report.note}`);
    if (report.heldOut?.length) console.log(`  experiment: ${report.heldOut.length} changed pages held out (not announced), ${added.length + updated.length - report.heldOut.length} announced`);
    for (const e of report.engines) console.log(`  ${mark(e.ok)} ${e.engine}  via ${e.via}: ${e.detail}`);
    if (report.collector) console.log(`  ${report.collector === 'sent' ? '✓' : '✗'} collector: ${report.collector}`);
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

async function cmdPrerender(cwd, v) {
  const config = await loadConfig(cwd, { site: v.site ?? 'https://localhost', outDir: v['out-dir'] }).catch(() => ({ outDir: v['out-dir'] ?? 'dist' }));
  const dir = path.resolve(cwd, v['out-dir'] ?? config.outDir ?? 'dist');
  const routes = [...(config.prerender?.routes ?? []), ...(v.routes ? v.routes.split(',').map((r) => r.trim()).filter(Boolean) : [])];
  const r = await prerender({ cwd, dir, routes, crawl: !v['no-crawl'] && config.prerender?.crawl !== false, max: v.max ? Number(v.max) : 200 });
  console.log(`knownsite prerender: ${r.pages.length} pages rendered to HTML in ${path.relative(cwd, dir) || '.'}/`);
  for (const p of r.pages) console.log(`  ✓ ${p.route}  ${p.words} words`);
  for (const s of r.skipped) console.log(`  • ${s.route}  skipped: ${s.reason}`);
  if (r.truncated) console.log('  stopped at --max; more routes were linked');
  console.log(`  The original app shell is ${SHELL_FILE}. Point your host's SPA fallback at it, not index.html:`);
  console.log(`    Netlify _redirects:  /*  /${SHELL_FILE}  200`);
  console.log(`    Vercel vercel.json:  "rewrites": [{ "source": "/(.*)", "destination": "/${SHELL_FILE}" }]`);
  console.log(`    Firebase:            "rewrites": [{ "source": "**", "destination": "/${SHELL_FILE}" }]`);
}

async function cmdConnect(cwd, v) {
  if (!v.collector) throw new Error('usage: knownsite connect --collector https://collector.example');
  const config = await loadConfig(cwd, { site: v.site });
  const privateKey = await loadPrivateKey(cwd);
  if (!privateKey || !config.keys[0]) throw new Error('connect needs your signing key (run `knownsite init`, or set KNOWNSITE_PRIVATE_KEY)');
  const tokens = await connectCollector({ collector: v.collector, site: config.site, privateKey, kid: config.keys[0].kid });
  await saveCollectorSettings(cwd, { collector: v.collector.replace(/\/$/, ''), site: config.site, ...tokens });
  console.log(`knownsite connect: ${config.site} registered with ${v.collector}`);
  console.log(`  tokens saved to ${COLLECTOR_FILE} (git-ignored). For your host (visit logging, notify in CI):`);
  console.log(`    KNOWNSITE_COLLECTOR=${v.collector.replace(/\/$/, '')}`);
  console.log(`    KNOWNSITE_INGEST_TOKEN=${tokens.ingestToken}   # write-only`);
  console.log('  The read token stays on this machine: `knownsite report --from-collector`.');
}

async function cmdReport(cwd, v, args) {
  if (v['from-collector']) {
    const col = await collectorSettings(cwd);
    if (!col?.readToken) throw new Error('not connected: run `knownsite connect --collector URL` first');
    const report = await fetchCollectorReport(col, v.days ? Number(v.days) : 30);
    console.log(v.json ? JSON.stringify(report, null, 2) : renderReport(report));
    return;
  }
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
  for (const file of v.logs ?? []) {
    const { events, lines, parsed } = await visitsFromLogs(await readFile(file, 'utf8'), { site });
    console.error(`knownsite report: ${file}: ${lines} lines, ${parsed} understood, ${events.length} crawler or AI-referral visits`);
    visits.push(...events);
  }
  const report = buildReport({ site, records, notifications, visits, days: v.days ? Number(v.days) : 30,
    hasVisitSource: Boolean(source || v.logs?.length) });
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
      logs: { type: 'string', multiple: true }, routes: { type: 'string' }, max: { type: 'string' }, 'no-crawl': { type: 'boolean' }, collector: { type: 'string' }, 'from-collector': { type: 'boolean' },
    },
  });
  const commands = { init: cmdInit, build: cmdBuild, notify: cmdNotify, verify: cmdVerify, check: cmdCheck, report: cmdReport, prerender: cmdPrerender, connect: cmdConnect };
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
