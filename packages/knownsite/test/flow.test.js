// End to end: build a fixture site, serve its output through a fake fetch, notify, verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, parseRecords, PATHS } from '../src/build.js';
import { notify } from '../src/notify.js';
import { verifySite } from '../src/verify.js';
import { generateKeys, verifyObject } from '../src/sign.js';
import { DEFAULTS } from '../src/config.js';

const SITE = 'https://example.com';
const page = (title, body, head = '') =>
  `<!doctype html><html lang="en"><head><title>${title}</title>${head}</head><body><main>${body}</main></body></html>`;

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'knownsite-'));
  const out = path.join(cwd, 'out');
  await mkdir(path.join(out, 'blog'), { recursive: true });
  await mkdir(path.join(out, '_next'), { recursive: true });
  await writeFile(path.join(out, 'index.html'), page('Acme', '<p>We make anvils.</p>', '<meta name="description" content="Anvils for everyone.">'));
  await writeFile(path.join(out, 'pricing.html'), page('Pricing', '<p>$10</p>'));
  await writeFile(path.join(out, 'blog', 'index.html'), page('Blog', '<p>Posts</p>'));
  await writeFile(path.join(out, 'secret.html'), page('Secret', '<p>x</p>', '<meta name="robots" content="noindex">'));
  await writeFile(path.join(out, '404.html'), page('Not found', '<p>404</p>'));
  await writeFile(path.join(out, '_next', 'junk.html'), page('junk', ''));
  return { cwd, out };
}

/** Fake fetch serving files from `out` as if deployed at SITE, and recording POSTs. */
function fakeHost(out, posts = []) {
  return async (url, init = {}) => {
    if (init.method === 'POST') {
      posts.push({ url, body: JSON.parse(init.body) });
      return new Response(null, { status: url.includes('indexnow') ? 200 : 202 });
    }
    const u = new URL(url);
    if (u.origin !== SITE) return new Response(null, { status: 404 });
    try {
      return new Response(await readFile(path.join(out, u.pathname)), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

test('build → notify → verify, then a second deploy reports only real changes', async (t) => {
  const { cwd, out } = await fixture();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const { privateKey, publicKey } = generateKeys();
  const config = {
    ...DEFAULTS, site: SITE, keys: [{ kid: 'k1', alg: 'Ed25519', pub: publicKey }],
    indexnow: { key: 'abc123' }, receivers: ['https://receiver.test'],
  };

  // First deploy: nothing live yet.
  const first = await build({ cwd, config, privateKey, previousRecords: [], now: new Date('2026-11-01T00:00:00Z') });
  assert.deepEqual(first.records.map((r) => r.url), [`${SITE}/`, `${SITE}/blog`, `${SITE}/pricing`]);
  assert.deepEqual(first.changes.added.length, 3);
  assert.deepEqual(first.skipped, [{ url: `${SITE}/secret`, reason: 'noindex' }]);
  assert.ok(first.records.every((r) => verifyObject(r, publicKey)));

  const sitemap = await readFile(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/example.com\/pricing<\/loc>/);
  assert.doesNotMatch(sitemap, /secret|404/);
  const llms = await readFile(path.join(out, 'llms.txt'), 'utf8');
  assert.match(llms, /^# Acme\n\n> Anvils for everyone\./);
  assert.match(await readFile(path.join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example.com\/sitemap.xml/);
  assert.match(await readFile(path.join(out, 'index.html'), 'utf8'), /"@type":"WebSite"/);
  assert.equal(await readFile(path.join(out, 'abc123.txt'), 'utf8'), 'abc123');

  // Notify against the "live" output.
  const posts = [];
  const report = await notify({ config, privateKey, fetchImpl: fakeHost(out, posts) });
  const indexnow = posts.find((p) => p.url.includes('indexnow'));
  assert.equal(indexnow.body.host, 'example.com');
  assert.equal(indexnow.body.keyLocation, `${SITE}/abc123.txt`);
  assert.equal(indexnow.body.urlList.length, 3);
  const knownsite = posts.find((p) => p.url === 'https://receiver.test/knownsite/notify');
  assert.ok(verifyObject(knownsite.body, publicKey));
  assert.ok(report.engines.find((e) => e.via === 'IndexNow').ok);
  assert.equal(report.engines.find((e) => e.engine === 'Google').ok, null);

  // Verify reaches Level 2 (no DNS record).
  const v = await verifySite(SITE, { fetchImpl: fakeHost(out), resolve: async () => [] });
  assert.equal(v.level, 2, JSON.stringify(v.checks));

  // Second deploy: edit pricing, delete blog, add about. Rebuild from fresh framework output.
  const previous = parseRecords(await readFile(path.join(out, PATHS.records), 'utf8'));
  await rm(path.join(out, 'blog'), { recursive: true });
  await writeFile(path.join(out, 'pricing.html'), page('Pricing', '<p>$12</p>'));
  await writeFile(path.join(out, 'index.html'), page('Acme', '<p>We make anvils.</p>', '<meta name="description" content="Anvils for everyone.">'));
  await writeFile(path.join(out, 'about.html'), page('About', '<p>Since 1950</p>'));
  const second = await build({ cwd, config, privateKey, previousRecords: previous, now: new Date('2026-11-02T00:00:00Z') });
  assert.deepEqual(second.changes, {
    added: [`${SITE}/about`], updated: [`${SITE}/pricing`], removed: [`${SITE}/blog`],
  });
  const home = second.records.find((r) => r.url === `${SITE}/`);
  assert.equal(home.modified, '2026-11-01T00:00:00Z', 'unchanged page keeps its lastmod');
});

test('build respects a framework-authored sitemap and works unsigned', async (t) => {
  const { cwd, out } = await fixture();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(out, 'sitemap.xml'), '<urlset>mine</urlset>');
  const r = await build({ cwd, config: { ...DEFAULTS, site: SITE }, privateKey: null, previousRecords: [] });
  assert.equal(await readFile(path.join(out, 'sitemap.xml'), 'utf8'), '<urlset>mine</urlset>');
  assert.ok(!r.signed);
  assert.ok(r.records.every((r) => !r.sig));
});

test('notify with no changes sends nothing', async (t) => {
  const { cwd, out } = await fixture();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const config = { ...DEFAULTS, site: SITE, indexnow: { key: 'k' } };
  await build({ cwd, config, privateKey: null, previousRecords: [] });
  const previous = parseRecords(await readFile(path.join(out, PATHS.records), 'utf8'));
  await build({ cwd, config, privateKey: null, previousRecords: previous });
  const posts = [];
  const report = await notify({ config, privateKey: null, fetchImpl: fakeHost(out, posts) });
  assert.equal(posts.length, 0);
  assert.match(report.note, /No content changes/);
});
