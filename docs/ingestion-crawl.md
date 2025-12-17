# Ingestion and Crawl Overview

## Job graph and recursion limits

- Supported recursive job types: `import_linktree`, `import_beacons`, `import_laylo`, `import_stan` (depth ≤ 3) and `import_youtube` (depth ≤ 1).
- Each job payload is normalized before enqueueing (https-only, allowlisted hosts) and deduped by canonical identity (`platform + normalizedUrl`).
- Follow-up crawling only enqueues when a discovered link passes platform validation for one of the supported strategies; other links are ignored.
- Creator profile ingestion status is flipped to `processing` at job start and back to `idle` on success; failures record the message and mark the job for retry up to `maxAttempts`.

## Dedupe and invariants

- Canonical identity uses normalized URLs and platform detection to collapse small URL variations (case changes, `www`, tracking params) into one record.
- Jobs dedupe on `(jobType, creatorProfileId, dedupKey)` across both the JSON payload and the indexed `dedup_key` column to stay migration-safe.
- Link merges respect existing state: manual links stay authoritative while ingested links update evidence, confidence, and state.

## Network support matrix

| Network     | Detection/classification | Scrape & normalize | Recursive follow-up |
|-------------|--------------------------|--------------------|---------------------|
| Linktree    | ✅                        | ✅ (structured + href fallback) | ✅ (depth 3) |
| Beacons     | ✅                        | ✅ (structured + href fallback) | ✅ (depth 3) |
| Laylo       | ✅                        | ✅ (JSON APIs)      | ✅ (depth 3) |
| YouTube     | ✅ (channels)             | ✅ (About page)     | ✅ (depth 1) |
| Stan        | ✅                        | ✅ (Next data + href fallback) | ✅ (depth 3) |
| Twitch      | ✅                        | 🚫 (detection-only) | 🚫 |
| OnlyFans    | ✅                        | 🚫 (detection-only) | 🚫 |

**Policies**

- Crawling is allowlisted per strategy; redirects to off-network hosts are rejected.
- Handles are derived from the job `sourceUrl` and normalized per strategy rules (lowercase, `@` stripped, validation per host).
- No open-web crawling: only network-specific links are fetched, and response size/timeouts are bounded by strategy defaults.
