# Help Center analytics (JOV-5905)

Aggregate-only sink measuring whether readers find answers and turning
recurring failures into content/product work. No raw queries, identity, or
DOM capture.

- **Client (docs.jov.ie)**: `apps/docs/lib/help-analytics.mjs` —
  `trackHelpCenterEvent()` builds a versioned, allowlisted payload and
  beacons it (sendBeacon, keepalive fetch fallback). Never throws.
- **Ingest (jov.ie)**: `POST /api/analytics/help-center` accepts single
  events or bounded batches, rate-limits by IP, validates the strict zod
  contract, CORS-restricted to docs.jov.ie / jov.ie / localhost.
- **Store**: `apps/web/lib/analytics/help-center.server.ts` writes Redis
  aggregates under `help-center:v1:*` (90-day retention, 24h event_id dedupe).

Privacy: queries ship only as truncated SHA-256 (`query_hash`) plus a coarse
length bucket; the schema is `.strict()` so secrets, paths, DOM text, and
identifiers are unrepresentable.

Stored aggregates: `top-queries`, `zero-results`, per-article
`article-feedback` hashes, and `escalations` keyed by
`event:article:surface`. The admin read/reporting view lands as a
follow-up.
