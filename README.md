# Knownsite

An open standard that makes a website discoverable by search engines and AI assistants the moment
it is deployed, in a format the site owner signs and controls.

Getting found today means repeating the same setup for every engine, and many new sites are built
with AI tools by people who have never heard of SEO. The Knownsite Protocol lets a site
announce itself and its changes **once, at deploy time**. It builds on what already works
(sitemaps, IndexNow, schema.org, llms.txt) and adds a content record the owner signs and usage
terms the owner declares. No party owns it; any platform, tool or indexer may implement it.

## In this repository

| | |
|---|---|
| [SPEC.md](SPEC.md) | The protocol, draft 0.1. Open for comment. |
| [packages/knownsite](packages/knownsite) | Reference implementation: the `knownsite` npm package and `knownsite` CLI. Zero dependencies. |
| [examples/demo-site](examples/demo-site) | A Next.js site that runs Knownsite on every build. |

## Try it

```sh
npx knownsite check https://your-site.com     # how findable is your site? (0-100; online check coming soon)
npx knownsite init --site https://your-site.com
```

See the [package README](packages/knownsite/README.md) for build, notify and verify.

## Feedback

The spec is a draft. Open an issue for questions, objections or proposals; the open questions
at the end of SPEC.md are a good place to start.

## License

Code: [MIT](LICENSE). Specification: [CC BY 4.0](LICENSE-SPEC.md).
