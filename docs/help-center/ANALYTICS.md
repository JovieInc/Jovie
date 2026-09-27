# Help Center analytics (JOV-5905)

Measures whether readers find answers and turns recurring failures into
content/product work — without surveillance. Aggregate-only sink; no raw
queries, no identity, no DOM capture.

## Architecture

- **Client (docs.jov.ie)**: `apps/docs/lib/help-analytics.mjs` is the
  canonical wrapper. `trackHelpCenterEvent()` builds a versioned,
  allowlisted payload and sends it via `navigator.sendBeacon` (or a
  keepalive `fetch` fallback) to the ingest endpoint. It never throws —
  analytics failures cannot break search, article rendering, or support
  submission.
- **Ingest (jov.ie)**: `POST /api/analytics/help-center`
  (`apps/web/app/api/analytics/help-center/route.ts`) accepts single events
  or bounded batches, rate-limits by IP, validates against the strict zod
  contract, and records aggregates in Redis. CORS is restricted to
  `docs.jov.ie`, `jov.ie`, and localhost dev origins.
- **Store**: `apps/web/lib/analytics/help-center.server.ts` writes sorted
  sets and hashes under `help-center:v1:*` with 90-day retention and 24h
  `event_id` dedupe.

## Events (schema_version 1)

`help_center_viewed`, `category_opened`, `article_viewed`, `search_opened`,
`search_query_submitted`, `search_result_selected` (result_id + rank),
`search_zero_results`, `article_feedback` (helpful / not_helpful + reason),
`related_guide_selected`, `contact_support_opened`,
`support_request_submitted`, `support_request_failed`, `support_escalation`.

Payload allowlist: `article_id`, `category_id`, `query_hash`,
`query_length_bucket`, `result_id`, `result_rank`, `source_article_id`,
`feedback`, `feedback_reason`, `source_surface`, `referrer_class`,
`signed_in`, `viewport_class`, `build_id`, `client_ts`.

## Privacy contract

- Queries never leave the browser in raw form — only a truncated SHA-256 of
  the normalized query (`query_hash`) plus a coarse length bucket.
- The zod schema is `.strict()`: secrets, auth payloads, payment details,
  free-form paths, DOM text, and user identifiers have no representable
  field and are rejected at ingest.
- `signed_in` is a bucket (`signed_in` / `signed_out` / `unknown`), never an
  identifier. No cross-user identifiers beyond the existing analytics
  identity contract.

## Closed-loop views

`GET /api/analytics/help-center` (admin) returns the four required signals:

1. `top_queries` — most-searched query hashes.
2. `zero_result_queries` — query hashes with repeated zero results.
3. `article_helpfulness` — helpful/not-helpful counts and negative ratio
   per article.
4. `escalations` — support contacts/escalations keyed by event, article,
   and source surface.

Plus `remediation_candidates`: deduplicated, evidence-backed items. A
candidate is emitted only past volume/confidence thresholds (≥3 zero-result
searches; ≥3 not-helpful ratings at ≥50% negative ratio; ≥3 escalations),
and its `candidate_key` is deterministic — one Linear issue per key, ever.
Content gaps and quality issues route to this project; product defects
route to the owning feature area via the article/escalation context.

## Walkthrough

1. `pnpm --filter @jovie/docs dev` and `pnpm --filter @jovie/web dev`.
2. Open `/docs`, press ⌘K, submit a nonsense query → `search_opened`,
   `search_query_submitted`, `search_zero_results` beacon to
   `/api/analytics/help-center` (Network tab).
3. Click "Contact support with this search" → `contact_support_opened` +
   `support_escalation` on docs, then `support_escalation` +
   `contact_support_opened` again on the jov.ie support landing.
4. Open an article → `article_viewed` + `category_opened`; click
   Yes/No in "Was this helpful?" → `article_feedback`; pick a reason and
   the support link → `support_escalation` with article context.
5. As admin, `GET /api/analytics/help-center` shows the four views and any
   remediation candidates.
