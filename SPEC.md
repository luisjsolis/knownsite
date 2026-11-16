# Knownsite Protocol — Draft 0.1

**Author:** Jose Solis · **Date:** 2026-11-09 · **Status:** Draft, open for comment · **License:** CC BY 4.0

## 1. Purpose

Knownsite lets a website announce itself and its changes to search engines and AI systems **once, at deploy
time**, in a format the site owner signs and controls. It builds on existing standards (sitemaps,
IndexNow, schema.org, llms.txt) rather than replacing them. Any platform, tool, or indexer may
implement it; no party owns it.

## 2. Roles

- **Owner** — controls the domain and holds the site's signing key.
- **Publisher** — the tool that runs on deploy (CLI, build step, hosting platform, coding agent).
- **Receiver** — any service that accepts Knownsite notifications (search engine, AI company, indexer).

## 3. Site manifest

Every Knownsite site serves `https://{host}/.well-known/discovery.json`:

```json
{
  "knownsite": "0.1",
  "site": "https://example.com",
  "keys": [{ "kid": "k1", "alg": "Ed25519", "pub": "<base64url public key>" }],
  "sitemap": "https://example.com/sitemap.xml",
  "summary": "https://example.com/llms.txt",
  "records": "https://example.com/.well-known/discovery/records.jsonl",
  "terms": { "search": "allow", "ai-answer": "allow-with-citation", "training": "deny" }
}
```

## 4. Ownership verification

The owner generates an Ed25519 keypair. The public key is proven to belong to the site by **either**:

1. **Well-known file** — the key is listed in `/.well-known/discovery.json` on the same host
   (same trust level as IndexNow's key file), **or**
2. **DNS** — a TXT record at `_knownsite.{host}` containing `kid=k1; pub=<base64url public key>`
   (stronger; survives a compromised deploy).

Either method is valid at every conformance level. DNS is RECOMMENDED; the well-known file exists
so that sites built with AI tools can reach Level 2 with zero manual setup.

Receivers MUST check that every URL in a notification belongs to the verified host. Key rotation:
publish the new key alongside the old one, sign with the new key, then remove the old one.

## 5. Deploy notification

On each deploy, the publisher sends `POST {receiver}/knownsite/notify` with `Content-Type: application/json`:

```json
{
  "knownsite": "0.1",
  "site": "https://example.com",
  "deploy": { "id": "dpl_abc123", "at": "2026-11-06T18:00:00Z" },
  "changes": {
    "added":   ["https://example.com/pricing"],
    "updated": ["https://example.com/"],
    "removed": ["https://example.com/old-page"]
  },
  "records": "https://example.com/.well-known/discovery/records.jsonl",
  "kid": "k1",
  "sig": "<base64url Ed25519 signature>"
}
```

- `sig` is computed over the RFC 8785 (JCS) canonical form of the object with `sig` omitted.
- Receivers SHOULD reject notifications older than 24 hours or with a previously seen `deploy.id`.
- Receivers respond `202 Accepted`; crawling and indexing remain at the receiver's discretion.
- For receivers that do not speak Knownsite, publishers translate the change list into existing
  protocols (IndexNow, sitemap ping, engine-specific APIs). This is how Knownsite is useful on day one.

## 6. Content record

`records.jsonl` holds one signed record per page — the owner's authoritative statement of what the
page is and how it may be used:

```json
{
  "url": "https://example.com/pricing",
  "title": "Pricing",
  "summary": "Plans start at $10/month; free tier for hobby projects.",
  "lang": "en",
  "modified": "2026-11-06T18:00:00Z",
  "hash": "sha256-<hash of the canonical page text>",
  "terms": { "training": "deny" },
  "kid": "k1",
  "sig": "<base64url signature>"
}
```

`hash` lets a receiver confirm that what it crawled matches what the owner published, and lets
anyone citing the page show which version they used. Page-level `terms` override site-level `terms`.

## 7. Usage terms

| Key         | Values                                        | Meaning                                  |
|-------------|-----------------------------------------------|------------------------------------------|
| `search`    | `allow` · `deny`                              | Index and link in search results         |
| `ai-answer` | `allow` · `allow-with-citation` · `deny`      | Use in AI-generated answers              |
| `training`  | `allow` · `deny`                              | Use to train models                      |
| `license`   | URL                                           | Further terms set by the owner           |

Terms are declarations, not access control; `robots.txt` still governs crawling. The keys above are
interim: Knownsite will adopt the IETF AI Preferences (AIPREF) vocabulary once it is published, mapping
these keys onto it, so that Knownsite does not create a competing vocabulary.

## 8. What Knownsite does not do

Knownsite does not affect ranking. Owners control their content and terms; how receivers rank or trust
content stays independent of the owner.

## 9. Conformance

- **Level 1:** manifest + sitemap + change notifications (IndexNow translation counts).
- **Level 2:** Level 1 + verified key (well-known file or DNS) + signed notifications and content records.

## Open questions

1. Should receivers be discoverable via a public registry, or configured by the publisher?
2. Canonical page-text rules for `hash` (strip nav/footers? render JS?).
3. Governance: where does the spec live long-term (independent foundation, W3C community group)?
