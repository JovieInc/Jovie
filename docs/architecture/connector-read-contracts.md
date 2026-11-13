# Connector execution contracts

Source review: 2026-11-13. This documents the existing architecture and a bounded
read-execution convergence. It is not a provider or production certification.

## Existing owners

`apps/web/lib/connectors/registry.ts` owns OAuth provider manifests, operation
capabilities, scopes, transport, account scope, platforms and sync labels.
File imports are separate manifest entries and never enter the OAuth vault.
`capabilities.ts` projects implemented, granted operations from connection state
and scopes. Settings' `ConnectorCard` already consumes this projection. Configured
availability is a separate server projection; it is not authorization or health.

Authenticated routes own user/profile authorization and account selection.
`token-vault.ts` owns encryption and refresh locking. Google and Spotify token
helpers own provider-specific refresh; provider adapters own API translation.
YouTube import uses its existing cursor and persistence contracts. Gmail metadata
ingestion uses `external_objects` conflict-safe inserts, then the existing
enrichment fact/suggestion pipeline. Its current HTTP caller is local-dev-only.

```text
authenticated user + selected identity
  -> owned connected account
  -> registry capability + recorded scope check
  -> existing vault / refresh lock / provider token adapter
  -> existing read adapter
  -> existing facts, import cursor and recorded outcomes
```

Ovie must supply identity/permissions to these owners, not fork them. JOV-6891 and
JOV-8674 retain company identity and live multi-finality commissioning. Fixture
users called customer/company do not prove that company identity is provisioned.

Write paths retain their own exact approval/revision, resource identity,
idempotency and durable receipt contracts (profile writes, YouTube link/thumbnail
apply, suggested actions). Granted OAuth capability never substitutes for action
approval. JOV-4496 owns profile connector contracts; JOV-6259's outcome compiler
produces disabled fact/action supplier drafts. JOV-8740 owns directory composition;
JOV-8741 owns authorized fulfillment and source replacement commissioning.

## This slice

Before, Gmail extraction bypassed the existing Google token freshness helper and
did not inspect the registry's read permission. It now requires
`booking_emails.read` before opening the vault, and uses
`loadFreshGoogleAccessToken`. Missing/rejected/unrefreshable tokens prevent provider
reads and downstream enrichment. A busy refresh propagates without a local retry.

Before, YouTube sync required the entire OAuth scope bundle, including writes.
It now consumes the same capability projection as Settings: paged import requires
`channel_videos.read`; full sync additionally requires `channel_analytics.read`.
The paged implementation explicitly supplies `windows: []`, so it performs no
analytics fetch. Missing required reads still return 409 before token/provider
access. OAuth authorize/callback consent requirements are unchanged.

This removes two runtime bypasses without adding a registry, adapter framework,
token store, job, schema, or approval system. PR #24807's unavailable setup copy
and PR #25282's tooltip parser are untouched.

## Evidence and limits

Regression tests fail against the original implementation and pass after the
change. Boundaries mock provider transport, vault storage and database writes;
ownership predicates are compiled through Drizzle. Existing registry tests cover
revoked/error/unavailable states, blocked writes and file-import separation.
Existing YouTube tests cover import ownership, retries, duplicate persistence,
provider errors and cursor state. They remain necessary alongside route tests.

Gmail's test-measured application calls per invocation are zero provider reads
without permission/access, one list and at most 20 metadata reads with access,
and at most one refresh request when expired. The helper reloads under the vault
lock and avoids a second refresh after a competing refresh. Existing transport
timeouts/retry policies remain authoritative; these counts are application calls,
not measured live network attempts or production cost savings.

`connected` remains stored connection state, not proof of a healthy provider.
This slice does not add universal health receipts or revoke derived facts. Gmail's
null-token return does not persist a new lifecycle state. Its partial metadata
failure behavior is unchanged. Those broader lifecycle/outcome obligations remain
with JOV-8012 and JOV-8741; live customer/company acceptance remains JOV-8674.
No deployment, live OAuth, native UI, real-provider outcome or full certification
is claimed. No accounts, credentials, security configuration, loops or production
data are changed by verification.

Ship now: registry-derived read preconditions and existing token freshness.
Re-evaluate when JOV-8012/8741 commissioning supplies exact-build access, failure
and outcome evidence. Then extend the same owners for demonstrated lifecycle gaps.
