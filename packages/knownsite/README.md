# knownsite

Make your site discoverable by search engines and AI assistants on every deploy. Reference
implementation of the [Knownsite Protocol](https://github.com/luisjsolis/knownsite/blob/main/SPEC.md). Zero dependencies, Node 20+.

```sh
npx knownsite init --site https://your-site.com   # once: keys + knownsite.config.json
next build && knownsite build                                 # every build, on the static output
knownsite notify                                              # every deploy, once it is live
knownsite verify                                              # check any site like a receiver would
knownsite check https://any-site.com                          # score how findable any site is (0-100)
```

## What it does

**`knownsite build`** runs on your framework's static output (`out/`, `dist/`, …) and writes:

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

**`knownsite check <url>`** scores any live site 0–100 on how well search engines and AI assistants can
find it, from the outside, the way a crawler sees it: robots.txt and real requests for Googlebot,
Bingbot, OAI-SearchBot, Claude-SearchBot and PerplexityBot; text readable without JavaScript;
sitemap; title, description, canonical, language, Open Graph, HTTPS; JSON-LD; llms.txt; and Knownsite.
It prints a ranked fix list; `--json` gives the full report. Being allowed in is not the same as being
indexed or cited, and the report never claims otherwise. Design: [CHECKER.md](https://github.com/luisjsolis/knownsite/blob/main/CHECKER.md).

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

Set the build command to `next build && knownsite build` (Next.js with `output: 'export'`), then run
`knownsite notify --deploy $VERCEL_DEPLOYMENT_ID` after deploy, e.g. from a GitHub Action on the
`deployment_status` event. The site URL defaults to `VERCEL_PROJECT_PRODUCTION_URL`.

## Library

```js
import { loadConfig, build, notify, verifySite } from 'knownsite';
```
