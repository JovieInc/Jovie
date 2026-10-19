# Resolver assertion producer coverage

JOV-8470, source inspected 2026-10-15. This is a source inventory, not deployed schema or runtime certification.

`admitAssertion` in [assertion.ts](../../apps/web/lib/canonical/assertion.ts) wraps the existing `SemanticContract.admit` primitive. Each observation carries entity kind/ID, field predicate, raw JSON value and polarity, source record/URI/revision, observed/effective time, producer/version, contract/canonical revision, calibrated assurance, independent health/freshness/completeness, tenant scope and field rights. Unknown assurance is explicit; a numeric confidence requires a calibration reference. Admission validates evidence; it does not select a winner, advance canonical revisions or authorize identity/ownership changes.

A predicate must match its contract field and version. A source-policy owner supplies reviewed field rights; this envelope grants no permissions. Unknown/denied storage fails before returning evidence. `projectAssertion` requires current trusted policy/deletion state and authenticated audience scope. It denies quarantined, deleted, expired, revoked, policy-stale and wrong-tenant observations, and unknown/denied display rights. Its whitelist excludes source records, URIs, raw evidence and provenance. Negative observations retain their polarity. Projection suppression is not physical erasure.

## Current boundaries

Paths below are relative to `apps/web/` unless stated otherwise. Envelope rollout remains [JOV-8504](https://linear.app/jovie/issue/JOV-8504); no row claims ledger integration.

| Producer | Current source boundary | Coverage / next slice |
| --- | --- | --- |
| Catalog import/backfill | `lib/discography/spotify-import.ts`, `lib/discography/artist-queries/artist-import.ts`, `scripts/backfill-collaborator-profiles.ts` | Artist registry imports use `findOrCreateArtist` admission; credit/profile reconciliation has separate boundaries. Carry actual provider record/time/revision through each. |
| CLI/MCP | Repo `packages/jovie-cli/src/commands.ts`, `packages/jovie-cli/src/mcp.ts`; `app/api/music/mcp/route.ts` | `resolve_music` is read-only. Profile creation is a separate command; do not add canonical writes to music reads. |
| Connected-account sync | `lib/youtube-library/sync.ts`, `lib/youtube-library/repository.ts`, `lib/connectors/youtube/sync-inbound-comments.ts` | Tenant library metrics/history and comments have their own persistence. Preserve account scopes and field restrictions rather than promoting private observations globally. |
| External API | `app/api/music/mcp/route.ts`, `lib/agent-acquisition/music-mcp.ts`, `lib/music-resolver/public-read.ts` | Resolver is read-only. Reuse allowed projections when ledger-backed results exist; read responses do not prove canonical persistence. |
| Refresh | `lib/dsp-enrichment/jobs/profile-enrichment.ts`, `lib/entity/resolve.ts`, `lib/identity/store.ts` | Profile updates and raw identity-link upserts are separate writes; re-enrichment currently overwrites links. Retain lawful observation history before canonical promotion. |
| Repair | `lib/discography/collaborator-profile-reconciliation.ts`, `lib/discography/release-credits.ts`, `lib/profile-surfaces/reconciliation.ts` | Credit repair and profile/source reconciliation are distinct from an assertion correction ledger. Require scoped lineage and expected revisions; reversible correction apply belongs to JOV-8471. |
| URL/name/ID ingest | `lib/music-resolver/in-house.ts`, `lib/music-resolver/public-read.ts`, `lib/leads/ingest-lead.ts` | Resolver candidates are read results; lead ingestion writes profiles and reconciles surfaces. Artist imports share the hardened admission boundary from merged #21874. |
| User corrections | `app/api/dashboard/profile/route.ts`, `app/api/dashboard/profile/lib/db-operations.ts`, `lib/services/profile/mutations.ts` | Owner profile edits use existing auth/version checks and mutations. An owner edit is not an unrestricted global identity grant. |

## Schema and rollout evidence

Production inspection attempted with `node scripts/db/prod-read.mjs` querying `information_schema.columns` for assertion/correction/ledger tables and `artist_identity_links`; it failed before connecting because no Doppler token is available. No deployed absence is inferred. Source has mutable `artist_identity_links`, `profile_surface_sources` with reconciliation generations, and qualification events; none proves a deployed field assertion/correction ledger. #20549 is closed/unmerged and is not implementation or an active ledger lease.

**Ship now:** the pure, tested envelope/projection contract and accurate persistence blocker (the parity evaluator now reports the unimplemented assertion store as an unblocked failure instead of accepting a stale lease), within one ≤500-line PR. **Re-evaluate when:** authorized read-only inspection supplies the deployed schema. **Then:** [JOV-8503](https://linear.app/jovie/issue/JOV-8503) reuses/extends the actual ledger in scoped append-only migration/backfill/rollback slices, with real-DB concurrency, idempotency, revision and physical-deletion evidence; JOV-8504 integrates producers with the existing JOV-7824 source-rights owner and JOV-7823 identity contracts. JOV-8471 owns reversible correction application and bypass guards. Parent acceptance and runtime commissioning remain open.
