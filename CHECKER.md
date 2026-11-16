# Discovery Checker — design draft 0.1

**Goal:** paste any URL, get a 0–100 "discoverability score" in under 10 seconds, plus a ranked list of
fixes. It is the front door: free, useful on its own, shareable, and every failing check maps to
something `knownsite build` fixes automatically.

**Headline:** "Can ChatGPT, Claude and Google find your site?"

## Principles
- Checks a live site from the outside, the way a crawler sees it. No login, no install.
- Every check has a plain-English result and a one-line fix. Score is secondary to the fix list.
- Facts only: check what is actually served. Never guess whether a site is "in" ChatGPT.
- Fast: fetch at most ~10 resources per scan, 5s timeout each, run in parallel.

## Checks (100 points)

### 1. AI and search crawlers can get in — 30 pts (most important; most common failure)
Fetch `/robots.txt`, evaluate rules for the homepage path per user agent.

| Crawler | Who | Points |
|---|---|---|
| Googlebot | Google Search | 7 |
| Bingbot | Bing, and indirectly ChatGPT/Copilot/DuckDuckGo | 7 |
| OAI-SearchBot | ChatGPT search | 6 |
| Claude-SearchBot | Claude | 5 |
| PerplexityBot | Perplexity | 5 |
| Google-Extended, GPTBot, ClaudeBot | Training only — **reported, not scored** (owner's choice) | 0 |

- Missing robots.txt = allowed (full points), note it.
- Also send a real GET with each search crawler's UA string; a 403/challenge page (common with
  bot protection / firewalls) = fail even if robots.txt allows. Flag "your firewall blocks X".
- Check `X-Robots-Tag` header and `<meta name="robots">` for `noindex` (−all crawler points if set).

### 2. Pages can be read without running JavaScript — 15 pts
Many AI crawlers do not execute JS. AI-built sites are often client-rendered SPAs.
- Fetch homepage HTML as-is (no browser). Extract the text a non-JS crawler can read: all of `<body>` except scripts, styles, templates and SVG.
- ≥ 200 words of real text → 15. 50–200 → 7. < 50 (e.g. empty `<div id="root">`) → 0.
- Fix: "Use server-side rendering or static export so crawlers see your content."
- Under 200 words, but the host renders pages for *verified* crawlers (checked by IP, so our
  spoofed user agents can't see it) → "?" with 7 points, not a critical finding. Two signals:
  the host is known to do this (Lovable hosting: `*.lovable.app` or `/__l5e/` in the page; match
  the host, not the builder, since a Lovable-built site hosted elsewhere gets nothing), or the page
  answers `Accept: text/markdown` with ≥ 50 words. The report's `rendering` field records both.
  Fix: render on the server for everyone (Lovable: "Migrate to TanStack Start").

### 3. Sitemap — 10 pts
- `Sitemap:` line in robots.txt, else try `/sitemap.xml`.
- Valid XML with ≥ 1 `<loc>` on the same host → 10. Exists but invalid/empty → 3. Missing → 0.
- Report URL count and newest `<lastmod>`.

### 4. Page basics — 15 pts (homepage only in v0.1)
| Item | Points |
|---|---|
| `<title>` present, 10–70 chars | 3 |
| meta description present, 50–160 chars | 3 |
| canonical link present and on same host | 2 |
| `<html lang>` set | 2 |
| Open Graph title/description/image | 2 |
| HTTPS, and http→https redirect | 3 |

### 5. Structured data — 10 pts
- Parse `<script type="application/ld+json">`. Valid JSON with a schema.org `@type` → 10.
  Present but invalid → 3. None → 0. Report types found (Organization, WebSite, Article, Product…).

### 6. AI-readable summary — 5 pts
- `/llms.txt` exists, is text/markdown, starts with `# ` heading → 5. Exists but malformed → 2.
- Label it honestly: "Emerging convention; cheap to add."

### 7. Change notifications (IndexNow) — 5 pts
- Look for an IndexNow key file: check `/.well-known/discovery.json` and common key-file locations
  advertised by the site. If we cannot confirm, show "unknown" (0 pts, no red X) with how to enable.

### 8. Knownsite Protocol — 10 pts
- `/.well-known/discovery.json` present and valid (reuse verify.js) → 5.
- Level 2: key verified (well-known or `_knownsite` DNS TXT) and a sampled content record signature
  verifies → +5.
- This is the only check that is "ours"; keep it at 10 so the score stays credible to people who
  never use Knownsite.

## Score bands
- 85–100 **Discoverable** · 60–84 **Partly visible** · 0–59 **Mostly invisible**
- Any critical failure (noindex, all AI search crawlers blocked, no readable text) caps the score
  at 40 and is shown first, regardless of other points.

## Output
1. Score + band + one sentence ("ChatGPT and Perplexity can't see this site because…").
2. Crawler grid: one row per crawler, ✓ / ✗ / ? with the reason.
3. Fix list, ordered by points recovered. Each fix: what, why (one line), how (snippet).
4. CTA: "Fix all of this automatically on every deploy: `npx knownsite init`."
5. Shareable result URL + an embeddable badge (later).

JSON shape (also the API response):
```json
{
  "url": "https://example.com/",
  "scannedAt": "2026-11-09T17:00:00Z",
  "score": 62,
  "band": "partly-visible",
  "critical": [],
  "checks": [
    { "id": "crawlers.oai-searchbot", "status": "fail", "points": 0, "max": 6,
      "message": "robots.txt disallows OAI-SearchBot",
      "fix": "Remove the Disallow rule for OAI-SearchBot" }
  ]
}
```

## Risks / honesty notes
- robots.txt semantics differ slightly per engine; follow RFC 9309 (longest match wins, Allow beats
  Disallow on tie) and say "per robots.txt rules" rather than "guaranteed".
- Being allowed ≠ being indexed or cited. Never claim the site "is in ChatGPT".
- Crawler UA spoofing: some sites verify crawlers by IP, so our UA test can give false "blocked".
  Show those as "?" with an explanation, not ✗.
- Fetching arbitrary URLs server-side: block private IP ranges / localhost (SSRF), cap redirects
  and response size.

## Open questions
1. Score more than the homepage (sample 5 sitemap URLs)? Slower but fairer.
2. Should the public checker store results? Useful research data, but say so on the page.
