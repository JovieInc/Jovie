# Summer Runtime Retirement and Eve Cutover Gate

> Effective: 2026-09-02
> Owner: Summer runtime / Eve integration
> Status: Hermes retired; Eve target not commissioned
> Machine record: [`scripts/summer-commissioning/architecture-freshness-registry.json`](../../scripts/summer-commissioning/architecture-freshness-registry.json)

## Current truth

Hermes and Trigger.dev are retired Jovie tooling. They are not active components, fallbacks, or approved rollback paths. Historical documents remain available for lineage, but retrieval must treat their runtime claims as superseded.

Summer currently has no commissioned conversational runtime. Eve is the intended target, but source integration alone is not deployment proof. Until exact-environment identity, persistence, failure, and recurrence receipts exist, callers must return `summer-local-runtime-retired-eve-unavailable` rather than route to Hermes or silently impersonate Summer through Ovie.

## Local retirement receipt

The macOS Summer runtime was retired recoverably on 2026-09-02:

- Disabled launch labels: `ai.hermes.gateway-summer`, `ai.hermes.summer-auto-update`, and `ai.jovie.summer-idle-kick`.
- Archived profile and durable context: `/Users/timwhite/.hermes/retired/summer-hermes-20260902T043256Z`.
- Machine receipt: `/Users/timwhite/.hermes/retired/summer-hermes-20260902T043256Z/RETIREMENT_RECEIPT.json`.
- The unrelated `co.jovie.hermes.gbrain-worker` service was not stopped or changed.
- No archived data was deleted. Restoring a retired launcher is prohibited unless a new architecture decision explicitly recommissions it.

## Eve and Photon readiness ledger

| Gate | State | Evidence | Required next proof |
| --- | --- | --- | --- |
| Hermes retirement | Passing locally | Disabled labels plus local retirement receipt | Recheck after login/reboot; any restart is a regression |
| Eve runtime | Blocked, source-only | `apps/eve-pilot` pins Eve and exposes channel routes | Exact deployed environment, Summer identity, durable session, failure, and recurrence receipts |
| Photon channel | Blocked, source-only | `apps/eve-pilot/agent/channels/photon.ts` implements signed webhook handling | Scoped Photon project, signed inbound fixture, explicit outbound denial, retry/dedupe receipts |
| iMessage account and identity | Blocked | Current Photon binding selects Ovie; no Summer credential or account boundary is configured | Explicit project/sender ownership, Tim-only allowlist, Summer identity mapping, thread/privacy boundary |
| Harmless end-to-end probe | Prepared, not run externally | Synthetic signed webhook can be handled without a network sender | Run locally/sandboxed, capture output in a test sink, and assert zero Photon outbound requests |

No Photon sender was activated, no iMessage login or setting was changed, no message was sent, and no conversation data was exposed during this retirement.

## Smallest harmless end-to-end test

Use a synthetic signed Photon webhook fixture addressed to a synthetic, allowlisted handle. Route it through an explicitly selected Summer shadow identity into an isolated test session and capture the generated response in a local or durable test sink. The test must fail if any Photon outbound API call occurs. It must also prove signature rejection, non-allowlisted rejection, deterministic conversation binding, deduplication, and a redacted failure receipt.

Only after that offline test passes may a separately authorized activation test send one opt-in synthetic message. That later test requires explicit approval because it changes an external messaging surface.

## Supersession and freshness

The architecture registry records owner, environment, source revision, effective time, refresh deadline, evidence tier, and superseded sources. Its validator rejects expired or conflicting records as well as any attempt to reactivate either retired tool. Historical documents are retained with a retirement notice instead of being deleted.
