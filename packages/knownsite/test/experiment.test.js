import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHeldOut, notify } from '../src/notify.js';
import { buildReport, renderReport } from '../src/report.js';

test('isHeldOut: deterministic, about the configured share, salt changes the split', () => {
  const urls = Array.from({ length: 2000 }, (_, i) => `https://a.test/p/${i}`);
  const held = urls.filter((u) => isHeldOut(u, { holdout: 0.5, salt: 'exp1' }));
  assert.ok(held.length > 900 && held.length < 1100, `${held.length}`);
  assert.deepEqual(urls.filter((u) => isHeldOut(u, { holdout: 0.5, salt: 'exp1' })), held, 'same split every time');
  assert.notDeepEqual(urls.filter((u) => isHeldOut(u, { holdout: 0.5, salt: 'exp2' })), held);
  assert.equal(urls.filter((u) => isHeldOut(u, {})).length, 0, 'off by default');
});

test('notify with holdout: held-back pages are not sent; removals always are', async () => {
  const site = 'https://a.test';
  const added = Array.from({ length: 20 }, (_, i) => `${site}/d/${i}`);
  const sent = [];
  const fetchImpl = async (url, opts) => {
    if (url.endsWith('last-deploy.json')) return Response.json({ deploy: { id: 'd1' }, changes: { added, updated: [], removed: [`${site}/gone`] } });
    sent.push(...JSON.parse(opts.body).urlList);
    return new Response('', { status: 200 });
  };
  const config = { site, indexnow: { key: 'k' }, receivers: [], keys: [], notify: { holdout: 0.5, salt: 's' } };
  const r = await notify({ config, privateKey: null, fetchImpl });
  assert.ok(r.heldOut.length > 0 && r.heldOut.length < 20);
  assert.equal(sent.length, 20 - r.heldOut.length + 1);
  assert.ok(sent.includes(`${site}/gone`));
  assert.ok(r.heldOut.every((u) => !sent.includes(u)));
});

test('report: announced vs held-back pages, time to first re-read per crawler', () => {
  const site = 'https://a.test';
  const day = (d, h = 0) => new Date(Date.UTC(2026, 10, d, h)).toISOString();
  const records = ['/d/1', '/d/2', '/d/3', '/d/4'].map((p) => ({ url: site + p, modified: day(1) }));
  const notifications = [{ at: day(1, 0), changes: { added: records.map((r) => r.url), updated: [], removed: [] },
    engines: [{ engine: 'Bing', via: 'IndexNow', ok: true }], heldOut: [`${site}/d/3`, `${site}/d/4`] }];
  const v = (path, d, h) => ({ at: day(d, h), kind: 'crawler', agent: 'bingbot', purpose: 'search', path, verified: true });
  const visits = [v('/d/1', 1, 6), v('/d/2', 1, 10), v('/d/3', 5, 0)]; // /d/4 never re-read
  const r = buildReport({ site, records, notifications, visits, now: new Date(day(10)) });
  assert.equal(r.experiment.announced, 2);
  assert.equal(r.experiment.heldOut, 2);
  const b = r.experiment.byAgent.bingbot;
  assert.deepEqual({ ...b.announced }, { pages: 2, reread: 2, medianHours: 8, within1d: 100, within3d: 100, within7d: 100 });
  assert.deepEqual({ ...b.heldOut }, { pages: 2, reread: 1, medianHours: 96, within1d: 0, within3d: 0, within7d: 50 });
  assert.equal(r.pages.find((p) => p.path === '/d/3').notified, null, 'held back = not told');
  const text = renderReport(r, { timeZone: 'UTC' });
  assert.match(text, /Experiment: 2 pages announced vs 2 held back/);
  assert.match(text, /bingbot\s+announced\s+2\/2\s+8h\s+100%/);
  assert.match(text, /held back\s+1\/2\s+4d\s+0%\s+0%\s+50%/);
});
