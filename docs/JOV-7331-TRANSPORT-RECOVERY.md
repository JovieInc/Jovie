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

The opt-in disposable Postgres canary covers concurrent lease/report calls,
REST receipt replay, restart durability and revocation. It refuses remote
database hosts and database names other than `jov7331_canary`. It remains
skipped when `FLEET_LOCAL_DB_URL` is absent. This recovery did not start a
database or rerun that canary; prior full-checkpoint evidence does not certify
this new source head.

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
Apply the binding patch only after the safety prerequisite and contracts/core
parents are present, then repeat checks against the resulting real branch.

Remaining qualification, release readback, worker commissioning and real Summer
canary acceptance are tracked by JOV-7331. Global qualification and publication
remain held while the existing expired invariant exceptions are unresolved
(JOV-7350 through JOV-7355). Independent review of the final recovered diff is
required before promotion. No production flag, credential or Linear mutation
was performed during recovery.
