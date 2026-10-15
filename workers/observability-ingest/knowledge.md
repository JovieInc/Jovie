# Private knowledge ingestion

JOV-8133 adds a separate Cloudflare Worker entry in the existing ingest workspace,
configured by `wrangler.knowledge.toml`, that checks approved upstream discovery feeds
or sitemaps daily at 05:17 UTC. It has no public content endpoint. The private
registry supplies each connector's endpoints and extraction settings; checked-in
files use only `SRC-N`. No Browser Rendering or paid SaaS is required for sources
that serve article HTML.

The sink wraps gbrain's existing `get_raw_data` / `put_raw_data` MCP operations.
Each distinct normalized title + text SHA-256 gets a page under
`raw/industry/src-n/<hash>`. Gbrain requires a parent page, so `put_page` creates
frontmatter with `canon: false`, `raw`, `non-canon`, `private-internal` tags and an
**empty body**. Fetched text goes only into the `raw_data` sidecar, whose source
is `SRC-N`, with `trust: untrusted` and `visibility: private-internal`. No promotion,
distillation or embedding operation is requested for fetched content. These
classification fields describe data; they do not replace access controls.

## Private configuration

Provision these as Worker secret bindings using the existing private secret
management path; never put their values in Wrangler vars, GitHub artifacts,
issues, source files, command history or PRs:

| Secret | Contract |
| --- | --- |
| `GBRAIN_MCP_URL` | Private HTTPS `/mcp` endpoint for the intended raw-data brain |
| `GBRAIN_API_KEY` | Dedicated read/write credential scoped to its private source |
| `KNOWLEDGE_SOURCES_JSON` | JSON array of the source definitions below |

Each definition requires `code` (`SRC-1`, `SRC-2`, `SRC-3`, etc.), `origin`
(HTTPS), `discoveryUrl` (same origin), `discoveryKind` (`feed` for RSS/Atom or
`sitemap` for XML, including nested indexes), `pathPrefix` (article path scope),
`contentTag` (`article` or `main`), `identityTerms` (all actual source names and
aliases), `approved` and `termsApproved` (explicit booleans). The hostname is
automatically added to redaction terms. Identity terms and endpoints live only
in that private registry. Title and body are cleaned of configured identities,
URLs, domains and email addresses before hashing and storage; page locations are
represented only by SHA-256 in the crawl index. No original HTML is retained.

Optional per-source integer limits:

| Field | Default | Range |
| --- | ---: | ---: |
| `intervalMs` | 2000 | 1000–60000 |
| `maxDiscoveryRequests` | 4 | 1–20 |
| `maxPages` | 20 | 1–100 |

Only approved sources with reviewed terms run. Missing approval, robots denial
or an excessive crawl delay blocks that source and fails the scheduled receipt.
Robots 404 allows crawling; other non-success responses fail closed. Every
discovery/article request checks robots, uses at least the configured interval
or crawl delay, refuses redirects and stays on the configured origin. Sources
must return server-rendered HTML; there is no paywall or bot-defense bypass.

## Operation and verification

Requests time out at 20 seconds and retry network/5xx failures once. A 429 stops
that source until the next daily attempt. Decoded responses are capped at 2 MB
(robots: 256 KB), discovery at 5000 article URLs and the run at ten minutes plus
an in-flight request. A `raw/industry/src-n/index` sidecar stores only URL hashes
and attempt times. New URLs take priority; older pages rotate through the page
budget. Content hashes dedupe replays and identical articles. A failed write
never counts as success or advances the saved crawl index. Sparse/broken article
extractions fail the run while allowing sibling articles to progress.

Receipts contain only source code, fixed status/reason, article counts and source
request count. Any blocked, failed or incomplete initial backfill rejects the
scheduled event. Enable the account's existing Worker failure monitoring and
route blocked `SRC-N` receipts to the source owner before changing permission.
There is no automatic bypass. No content is returned over HTTP or uploaded as a
CI artifact; internal copyright material must remain in the access-controlled
brain and must not be republished verbatim.

At defaults, three sources make at most 150 upstream requests/day (robots +
four discovery documents + twenty article requests, each at most two attempts).
Gbrain uses at most 63 calls/source/run for twenty new articles plus its index,
or about 5670/month across three sources before transport retries. Work is
independent of artist/user count. Cloudflare Workers use the approved account's
credits; no new paid provider or embedding calls are introduced. Confirm the
actual account limits and private source budgets before enabling the trigger.

Run from the repository root:

```bash
pnpm --filter @jovie/observability-ingest typecheck
pnpm --filter @jovie/observability-ingest test:knowledge
```

Ship now: bounded daily ingestion with persistent dedupe and source approval.
Re-evaluate when discovery/page limits prevent a new URL being ingested within
24 hours, or the run reaches its wall-clock budget. Then: partition private
discovery scopes or revise budgets within approved credits. Live acceptance
is tracked in JOV-8429 and requires a private, exact-deployment receipt for all approved `SRC-N` sources,
hash replay, robots refusal and empty canonical bodies; unit tests do not prove
that production has been commissioned.
