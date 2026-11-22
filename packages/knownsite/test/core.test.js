import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, generateKeys, signObject, verifyObject, publicKeyFor } from '../src/sign.js';
import { fileToPath, parseHtml, pageText, summarize } from '../src/scan.js';
import { diffRecords } from '../src/build.js';

test('canonicalize sorts keys, drops undefined, matches RFC 8785 for simple values', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'], c: undefined }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalize({ n: 1e21, f: 0.1 }), '{"f":0.1,"n":1e+21}');
  assert.equal(canonicalize({ 'é': 1, z: 2, Z: 3 }), '{"Z":3,"z":2,"é":1}');
});

test('sign and verify round trip; tampering and wrong key fail', () => {
  const { privateKey, publicKey } = generateKeys();
  assert.equal(publicKeyFor(privateKey), publicKey);
  const signed = signObject({ url: 'https://example.com/', hash: 'sha256-abc' }, privateKey, 'k1');
  assert.equal(signed.kid, 'k1');
  assert.ok(verifyObject(signed, publicKey));
  assert.ok(!verifyObject({ ...signed, hash: 'sha256-xyz' }, publicKey));
  assert.ok(!verifyObject(signed, generateKeys().publicKey));
  // key order must not matter
  const reordered = Object.fromEntries(Object.entries(signed).reverse());
  assert.ok(verifyObject(reordered, publicKey));
});

test('fileToPath maps static export files to URL paths', () => {
  assert.equal(fileToPath('index.html'), '/');
  assert.equal(fileToPath('about.html'), '/about');
  assert.equal(fileToPath('blog/index.html'), '/blog');
  assert.equal(fileToPath('blog/post-1.html'), '/blog/post-1');
});

test('parseHtml extracts metadata and canonical text', () => {
  const html = `<!doctype html><html lang="en"><head>
    <title>Pricing &amp; Plans</title>
    <meta content="Cheap plans." name="description">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://example.com/pricing">
    <script>var x = "<p>not text</p>"</script></head>
    <body><nav>Home About</nav><main><h1>Pricing</h1><p>From&nbsp;$10.</p></main><footer>©</footer></body></html>`;
  const m = parseHtml(html);
  assert.equal(m.title, 'Pricing & Plans');
  assert.equal(m.description, 'Cheap plans.');
  assert.equal(m.lang, 'en');
  assert.equal(m.canonical, 'https://example.com/pricing');
  assert.equal(m.noindex, false);
  assert.equal(m.hasJsonLd, false);
  assert.equal(m.text, 'Pricing From $10.');
});

test('pageText falls back to body without nav/header/footer; noindex detected', () => {
  const html = '<html><head><meta name="robots" content="noindex"></head><body><header>H</header><p>Hello</p><footer>F</footer></body></html>';
  assert.equal(pageText(html), 'Hello');
  assert.equal(parseHtml(html).noindex, true);
});

test('summarize prefers description and truncates on a word boundary', () => {
  assert.equal(summarize('desc', 'text'), 'desc');
  assert.equal(summarize('', 'one two three four', 9), 'one two…');
});

test('diffRecords classifies added, updated, removed', () => {
  const prev = [{ url: 'a', hash: '1' }, { url: 'b', hash: '1' }, { url: 'c', hash: '1' }];
  const next = [{ url: 'a', hash: '1' }, { url: 'b', hash: '2' }, { url: 'd', hash: '1' }];
  assert.deepEqual(diffRecords(prev, next), { added: ['d'], updated: ['b'], removed: ['c'] });
});

test('diffRecords counts a title or summary change as an update', () => {
  const prev = [{ url: 'a', hash: '1', title: 'Old' }, { url: 'b', hash: '1', summary: 'x' }, { url: 'c', hash: '1' }];
  const next = [{ url: 'a', hash: '1', title: 'New' }, { url: 'b', hash: '1', summary: 'y' }, { url: 'c', hash: '1', title: '' }];
  assert.deepEqual(diffRecords(prev, next), { added: [], updated: ['a', 'b'], removed: [] });
});

test('hostingWarnings flags a Firebase ignore rule that would drop /.well-known/', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { hostingWarnings } = await import('../src/build.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'ks-'));
  assert.deepEqual(await hostingWarnings(dir), []);
  await writeFile(path.join(dir, 'firebase.json'), JSON.stringify({ hosting: { public: 'out', ignore: ['firebase.json', '**/.*'] } }));
  assert.match((await hostingWarnings(dir))[0], /\.well-known/);
  await writeFile(path.join(dir, 'firebase.json'), JSON.stringify({ hosting: [{ site: 'a', ignore: ['**/node_modules/**'] }] }));
  assert.deepEqual(await hostingWarnings(dir), []);
});

test('build ignores previous records on another origin (domain move): nothing "removed" on the old host', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { build } = await import('../src/build.js');
  const { DEFAULTS } = await import('../src/config.js');
  const cwd = await mkdtemp(path.join(tmpdir(), 'ks-move-'));
  await mkdir(path.join(cwd, 'out'));
  await writeFile(path.join(cwd, 'out', 'index.html'), '<html><head><title>Home</title></head><body><main>Hello there</main></body></html>');
  const r = await build({ cwd, config: { ...DEFAULTS, site: 'https://new.test' }, privateKey: null,
    previousRecords: [{ url: 'https://old.test/', hash: 'x' }, { url: 'https://old.test/blog', hash: 'y' }] });
  assert.deepEqual(r.changes, { added: ['https://new.test/'], updated: [], removed: [] });
});
