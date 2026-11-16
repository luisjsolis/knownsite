# Knownsite demo site

A Next.js site (static export) that runs the Knownsite Protocol on every deploy. It is also the
project's own site. `/discovery` shows its live discovery files.

- **Build:** `npm run build` runs `next build && knownsite build`.
- **After deploy:** `.github/workflows/knownsite-notify.yml` runs `knownsite notify` and `knownsite verify`.

## Deploy on Firebase (where it runs now: https://knownsite.web.app)

```sh
npm run deploy:firebase   # builds signed for knownsite.web.app, then firebase deploy
```

`firebase.json` sends `X-Robots-Tag: noindex, nofollow` on every response while the site is in
private testing: it is shared by link, not listed in search. robots.txt still allows crawling on
purpose (a crawler has to fetch a page to see its noindex). `knownsite notify` is not run for this
site yet. At launch: remove the header, deploy, then run `knownsite notify`.

## Deploy on Vercel

1. Import the repo in Vercel and set **Root Directory** to `examples/demo-site`. Framework, build
   command and output are detected.
2. Add the signing key: `vercel env add KNOWNSITE_PRIVATE_KEY production < .knownsite/private.key`
3. In GitHub, add secret `KNOWNSITE_PRIVATE_KEY` (same value) and variable `KNOWNSITE_SITE` (production URL).

The site URL comes from `VERCEL_PROJECT_PRODUCTION_URL` at build time; set `KNOWNSITE_SITE` to override.

## Local

```sh
KNOWNSITE_SITE=http://localhost:3000 npm run build   # then serve out/ with clean URLs
```
