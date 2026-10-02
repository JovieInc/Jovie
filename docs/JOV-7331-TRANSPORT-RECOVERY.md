# JOV-7331 server transport recovery

This layer extends core `acebaff39a3ba619cef6ed79ed0f2e90aef2db9d` with the
reviewed HTTP handler, founder control routes, runtime wiring and protected
Linear adapter from full checkpoint `131334e437de03cd0343e2b48bae0fb0c112f927`.
The dispatcher remains unchanged. New OpenAPI metadata marks only the six
internal fleet invocation routes implemented; the four product invocation
contracts remain unimplemented. Product-session discovery still denies worker
scope.

Runtime exposure remains disabled unless `JOVIE_FLEET_ENABLED` is explicitly
`1`. Worker identities are revocable and scoped to their own profile. Founder
control rejects bearer credentials and cross-origin requests, requires an admin
session and owned profile, and preserves one-use approval binding. Mission
admission requires canonical Linear verification. Provider effects retain
deterministic IDs, reauthorization, durable fencing and exact evidence proof.
Automatic mutation retries are absent.

Founder control now bypasses the session cookie cache before checking admin and
profile ownership, so a revoked database session cannot approve or provision a
worker. Both HTTP entry points share the existing durable general rate limiter
on a trusted client IP key before body parsing or runtime construction. Exhaustion
returns 429; unavailable storage fails closed with 503 and retry guidance.

Current October 2 local verification confirms PostgreSQL registration and concurrent
lease CAS. The unchanged public OpenAPI read is blocked by this environment's
proxy (403), so the current complete canary remains unverified. No fixture replaces
that public read; the earlier completed canary below remains historical evidence.

The opt-in disposable Postgres canary covers concurrent lease/report calls,
REST receipt replay, restart durability and revocation. It refuses remote
database hosts and database names other than `jov7331_canary`. It remains
skipped when `FLEET_LOCAL_DB_URL` is absent. The unchanged recovered transport
commit passed a subsequent disposable PostgreSQL 18 canary on October 1: one
test passed, zero failed and zero skipped. It proved actual CAS contention, REST
receipt replay, restart durability, revocation and absence of raw-token
persistence. The isolated cluster was stopped and removed. This local proof
does not establish deployed runtime acceptance.

Focused recovery checks:

- 60 canonical contract tests, including generated artifact parity.
- 13 dispatcher, eight Linear and seven HTTP tests. HTTP cases include canonical
  receipt replay, control isolation, unknown routes, default-disabled behavior,
  oversized bodies, pre-aborted bodies and stalled-body deadline cancellation.
- Eight standard node-test registry checks. Sparse omitted test/config files
  were materialized unchanged from Git objects rather than installing packages.
- Strict focused typechecks for dispatcher, HTTP, Linear and their touched tests;
  canonical contract typecheck; Biome checks for touched sources.

CLI/MCP bindings remain a separate source layer because they depend on final
public safety source `17b3a5fdb1e633ba4f184248c2cbddd13ce30958` (PR 19742).
The prepared patch adds only worker-token propagation, generated fleet command
bindings, canonical result exit status, private MCP tool discovery and fourteen
adapter regressions. It preserves bodyless-abort handling, response limits,
UTF-8 BOM decoding, strict MCP validation, truthful public annotations, JSON
help/version regressions and existing publication verification scripts.

The isolated CLI proof combines that final safety source with the binding patch:
79 source tests, its package typecheck and touched-source Biome checks pass.
Safety PR 19742 merged as `8a07cf59663d7afd51aeaca3530f01819577f0e9`.
Apply the binding patch only after that prerequisite and contracts/core parents
are present, then repeat checks against the resulting real branch.

Remaining qualification, release readback, worker commissioning and real Summer
canary acceptance are tracked by JOV-7331. The independently reviewed recovered source
remains subject to current exact-head qualification and native queue checks.
Canonical Summer-owned exceptions expire October 31 and are enforced normally.
Approval provenance is a separate audit, not an additional source admission
gate. No exception or policy file is changed by this recovery. No production flag, credential or Linear mutation
was performed during recovery.
