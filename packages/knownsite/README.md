# knownsite

Make your site discoverable by search engines and AI assistants on every deploy. Reference
implementation of the [Knownsite Protocol](https://github.com/luisjsolis/knownsite/blob/main/SPEC.md). Zero dependencies, Node 20+.
Website: [knownsite.dev](https://knownsite.dev)

```sh
npx knownsite init --site https://your-site.com   # once: keys + knownsite.config.json
next build && knownsite build                                 # every build, after your framework
knownsite notify                                              # every deploy, once it is live
knownsite verify                                              # check any site like a receiver would
knownsite check https://any-site.com                          # score how findable any site is (0-100)
```

## What it does

**`knownsite build`** runs after your framework's build, on its static output (`out/`, `dist/`, …) or
a Next.js server build (see below), and writes:

| File | For |
|---|---|
| `sitemap.xml` | Every search engine. Left alone if your framework already makes one. |
| `robots.txt` | Created or given a `Sitemap:` line. |
| `llms.txt` | AI assistants: site summary and a page index. |
| JSON-LD in each page | `WebSite` / `WebPage` structured data, only where none exists. |
| `.well-known/discovery.json` | Knownsite manifest: public key, terms, pointers. |
| `.well-known/discovery/records.jsonl` | One signed content record per page (URL, title, summary, content hash). |
| `.well-known/discovery/last-deploy.json` | What changed in this deploy, diffed against the live site. |
| `{indexnow-key}.txt` | IndexNow key file proving you own the host. |

Pages marked `noindex`, pages whose canonical points elsewhere, and `/404` and `/500` are skipped.

## Single-page apps (Vite, Bolt, Create React App)

An SPA's HTML is an empty `<div id="root">` until JavaScript runs, and most search and AI crawlers
don't run it. `knownsite prerender` opens each page in a headless browser and saves what it renders
as real HTML, before `knownsite build`:

```sh
npm i -D playwright && npx playwright install chromium
# knownsite.config.json: "outDir": "dist"
"build": "vite build && knownsite prerender && knownsite build"
```

It follows internal links from `/` (add others with `"prerender": { "routes": ["/hidden"] }`),
skips pages that render almost nothing, and never overwrites a real static page. The original
empty shell is kept as `200.html`; point your host's SPA fallback at it instead of `index.html`, so
routes that weren't prerendered still boot the app (the command prints the line for Netlify, Vercel
and Firebase). Visitors get the same app as before: the saved pages still load your JavaScript.

## Next.js without static export

If there is no `out/` but there is a `.next/` build, `knownsite build` runs in server mode:

- It reads the prerendered pages from `.next/server/app` (and `pages/`) and writes its files to
  `public/`, which Next.js and Vercel serve as static files.
- Pages rendered per request (dynamic, e.g. reading cookies or headers) have no HTML at build time,
  so they aren't recorded yet; the build lists them.
- Routes your app serves itself (`app/sitemap.ts`, `app/robots.ts`, an `llms.txt` route) are kept.
- It does not edit HTML in server mode: add JSON-LD in your layout. The build says how many pages
  have none.

The files in `public/` are build output; keep them out of git:

```
# .gitignore
public/.well-known/discovery.json
public/.well-known/discovery/
public/sitemap.xml
public/llms.txt
```

(Skip any line for a file you wrote yourself. `robots.txt` and the IndexNow key file are safe to
commit.)

**`knownsite notify`** reads `last-deploy.json` from the live site and sends only the changed URLs:

- **IndexNow** → Bing, Yandex, Naver, Seznam, Yep
- **Knownsite receivers** listed in `receivers`, as a signed notification
- **Google**: no push API exists for general sites. Your sitemap is linked from `robots.txt`; submit it
  once in Search Console.

It prints a per-engine report and saves it to `.knownsite/report.json`. Use `--deploy <id>` to wait until a
specific deploy is live, `--dry-run` to send nothing, and `--strict` to exit non-zero on any failure.

**`knownsite verify`** fetches a site's manifest, sitemap, change list and records, checks every signature
against keys from the well-known file and the `_knownsite.{host}` DNS TXT record, and reports the
conformance level (0, 1 or 2).

**`knownsite check <url>`** (online, coming soon) scores any live site 0–100 on how well search engines and
AI assistants can find it, from the outside, the way a crawler sees it, and prints a ranked fix list
(`--json` gives the full report). The check is moving to Knownsite's servers, the same one as
[knownsite.dev/check](https://knownsite.dev/check); until it's live the command says so. It will send only the
address you give it. Being allowed in is not the same as being indexed or
cited, and the report never claims otherwise.

## Configuration: `knownsite.config.json`

```json
{
  "site": "https://your-site.com",
  "outDir": "out",
  "name": "Optional site name for llms.txt",
  "description": "Optional one-line description",
  "keys": [{ "kid": "k1", "alg": "Ed25519", "pub": "…" }],
  "indexnow": { "key": "…" },
  "terms": { "search": "allow", "ai-answer": "allow-with-citation", "training": "deny" },
  "receivers": [],
  "exclude": ["/404", "/500", "/drafts/*"],
  "jsonld": true
}
```

The private key lives in `.knownsite/private.key` (git-ignored) or the `KNOWNSITE_PRIVATE_KEY` environment
variable. Without it, output is unsigned (Level 1) and everything else still works.

## Vercel

```sh
vercel env add KNOWNSITE_PRIVATE_KEY production < .knownsite/private.key
```

Set the build command to `next build && knownsite build` (static export or server mode), then run
`knownsite notify --deploy $VERCEL_DEPLOYMENT_ID` after deploy, e.g. from a GitHub Action on the
`deployment_status` event. The site URL defaults to `VERCEL_PROJECT_PRODUCTION_URL`.

## Firebase Hosting

`firebase init` adds `"**/.*"` to `hosting.ignore`, which skips every dotfile, including
`.well-known/`. Remove that entry (or your records won't be uploaded and `knownsite verify` shows
Level 0).

## Discovery report (preview): who read your pages, and what happened after a change

```sh
knownsite report --visits visits.jsonl
```

```
  What changed, and what happened next
    /pricing  changed Tue, Nov 17
      → told Bing, Yandex, Naver, Seznam, Yep  the same day
      → bingbot re-read it  Tue, Nov 17 (+5h)
      → OAI-SearchBot re-read it  Wed, Nov 18 (+18h)
      → 40 visitors from AI answers since (ChatGPT 40)
```

It joins three things: when each page changed (the signed records on your live site), when engines
were told (`knownsite notify` appends to `knownsite.history.jsonl`; commit it), and visit events:
AI and search crawler visits, checked against each operator's published IP ranges, and people
arriving from ChatGPT, Claude, Perplexity, Gemini or Copilot answers. Without visit events the
report still shows changes and notifications.

Crawlers don't run JavaScript, so analytics scripts never see them. Visits are recorded at request
time. Next.js (`proxy.ts`, or `middleware.ts` before Next.js 16):

```js
import { knownsiteVisits } from 'knownsite/next';
const logVisit = knownsiteVisits(); // one JSON line per visit in your logs

export function proxy(request, event) {
  logVisit(request, event); // runs in the background via event.waitUntil
}
```

Send events somewhere you can read back, e.g. a database table:

```js
import { knownsiteVisits, httpSink } from 'knownsite/next';
const logVisit = knownsiteVisits({
  sink: httpSink(`${process.env.SUPABASE_URL}/rest/v1/knownsite_visits`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  }),
});
```

Events have the fields `at, kind, agent, company, purpose, path, verified, ip, user_agent`.
`knownsite report --visits` reads a file or URL with a JSON array, JSON lines, or log lines
containing `{"knownsite_visit": …}` (so exported Vercel logs work as is). Pass auth headers with
`--visits-header "apikey: …"`. Other servers: `recordVisit(request, { sink })` from
`knownsite/visits` takes any standard `Request`.

Or connect a collector, a service that keeps visits and notify history for you (nothing to lose
on CI machines, no database to run). Your site registers by signing a challenge with its Knownsite
key, so no account is needed:

```sh
knownsite connect --collector https://collector.example   # once; tokens go to .knownsite/
# on your host: KNOWNSITE_COLLECTOR and KNOWNSITE_INGEST_TOKEN (write-only) — printed by connect
knownsite report --from-collector
```

With those two variables set, `knownsiteVisits()` and `knownsite notify` send there automatically.

**Measure what announcing changes is worth.** Hold back a share of new or changed pages from
`notify` and compare how fast crawlers come back to announced vs held-back pages:

```json
"notify": { "holdout": 0.5, "salt": "exp-2026-11" }
```

Each page lands in the same group on every deploy (by URL hash); removals are always announced;
held-back pages stay in your sitemap. `knownsite report` then adds an "Experiment" table: per
crawler, pages re-read, median time to first visit, and the share re-read within 1, 3 and 7 days.
Remove the setting to announce everything again.

Static sites (no request-time code): read your host's access logs instead. `--logs` understands
Google Cloud Logging JSON (Firebase Hosting, once Cloud Logging is turned on under Hosting →
Integrations), Vercel log drains, Cloudflare Logpush and nginx/Apache combined logs, and runs each
line through the same crawler and referral checks:

```sh
gcloud logging read 'logName="projects/YOUR_PROJECT/logs/firebasehosting.googleapis.com%2Fwebrequests"' \
  --project YOUR_PROJECT --freshness 30d --format json > hosting.json
knownsite report --logs hosting.json   # a JSON array or JSON lines both work
```

If `notify` runs in CI (e.g. a GitHub Action), the history file is written on the CI machine and
lost with it; commit it from the job or keep running `notify` locally for now.

Privacy: visits from people (AI referrals) store no IP address and no User-Agent, only the
assistant they came from and the page. Crawler visits keep the IP, which is the bot's and is what
verification rests on. Only production traffic is recorded by default.

## Library

```js
import { loadConfig, build, notify, verifySite } from 'knownsite';
```
