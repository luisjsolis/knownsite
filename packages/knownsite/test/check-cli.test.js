import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

const REPORT = { url: 'https://example.com/', score: 72, band: 'partly-visible', critical: [], notes: [],
  crawlers: [{ token: 'Googlebot', who: 'Google Search', status: 'pass', message: 'allowed' }],
  training: [{ token: 'GPTBot', allowed: false }],
  checks: [{ group: 'sitemap', status: 'fail', points: 0, max: 10, message: 'No sitemap' }],
  fixes: [{ fix: 'Publish /sitemap.xml', gain: 10 }] };

test('`knownsite check` asks the hosted check API and prints its report', async () => {
  let asked = null;
  const server = createServer((req, res) => {
    asked = req.url;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(REPORT));
  }).listen(0);
  try {
    const api = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await run(process.execPath, [CLI, 'check', 'example.com'], { env: { ...process.env, KNOWNSITE_CHECK_API: api } });
    assert.equal(asked, '/api/check?url=example.com');
    assert.match(stdout, /72\/100/);
    assert.match(stdout, /\+10 Publish \/sitemap\.xml/);
    assert.match(stdout, /blocks GPTBot/);
  } finally {
    server.close();
  }
});

test('`knownsite check` explains an error from the API', async () => {
  const server = createServer((req, res) => res.writeHead(400, { 'content-type': 'application/json' })
    .end(JSON.stringify({ error: "nope.invalid doesn't exist" }))).listen(0);
  try {
    const api = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(run(process.execPath, [CLI, 'check', 'nope.invalid'], { env: { ...process.env, KNOWNSITE_CHECK_API: api } }),
      (err) => /doesn't exist/.test(err.stderr + err.stdout));
  } finally {
    server.close();
  }
});

test('`knownsite check` says "coming soon" while the check API isn\'t live', async () => {
  const server = createServer((req, res) => res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>')).listen(0);
  try {
    const api = `http://127.0.0.1:${server.address().port}`;
    const { stdout } = await run(process.execPath, [CLI, 'check', 'example.com'], { env: { ...process.env, KNOWNSITE_CHECK_API: api } });
    assert.match(stdout, /coming soon/);
  } finally {
    server.close();
  }
});
