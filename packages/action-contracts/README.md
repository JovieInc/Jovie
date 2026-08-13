# @jovie/action-contracts

Versioned contract foundation for the Jovie Canonical Actions platform
(JOV-5041). This package is the **single owner of action identity** for the
four stable actions:

| ID | Purpose |
| --- | --- |
| `chat.start` | Begin a new conversation handoff (navigation; never persists an empty conversation) |
| `contact.create` | Create an internal artist contact |
| `release.create` | Create a manual Jovie release draft |
| `task.create` | Create an internal task |

IDs describe durable outcomes, not screens, routes, buttons, or protocols. A
materially different effect receives a different ID.

## What lives here

- `ids.ts` — the stable action IDs. Once shipped, an ID is never renamed,
  reused, or deleted.
- `descriptor.ts` — the canonical `ActionDescriptor`: `id`, integer
  `schemaVersion`, `titleKey`/`descriptionKey` (product vocabulary keys, never
  localized prose), `inputSchema`/`outputSchema`, `effect` (`navigation` |
  `internal_write` | `external_write` | `destructive`), `confirmation`
  (`none` | `required`), `supportedChannels`, `requirements` (declared by
  name, never evaluated here), and optional
  `minimumClientVersions`/`deprecatedAt`/`sunsetAt`. Also the
  `ResolvedActionCapability` shape returned by authenticated discovery —
  advisory UX, never authorization.
- `invocation.ts` — the `ActionInvocation` envelope for
  `POST /api/v1/actions/{actionId}/invoke`: `schemaVersion`, top-level
  `idempotencyKey`, `context: { profileId, channel, clientVersion? }`
  (`profileId` is requested scope, never trusted identity), `input`, and
  optional `confirmationToken`. Also the six-status `ActionResult` union and
  the durable `ActionReceipt`. Context fields live in the envelope, never
  inside domain input schemas.
- `errors.ts` — the stable error vocabulary (`ACTION_ERROR_CODES`), the
  structured `ActionError` (`code`, `messageKey`, `retryable`, optional
  `fieldIssues`/`upgrade`/`handoff`), `EntityRef`, and the semantic
  `ActionHandoff` (e.g. target `chat.new`; the contract never contains routes
  or URLs).
- `actions/` — one descriptor per stable ID.
- `manifest.ts` — the canonical registry. No surface may add a public action
  identifier absent from the manifest.
- `generated/` — deterministic JSON Schema (draft 2020-12) and OpenAPI 3.1
  artifacts derived from the manifest. Regenerate with
  `pnpm --filter @jovie/action-contracts run generate`; CI and
  `schema-parity.test.ts` fail on drift.
- `bindings/` — contract-only specifications for Swift (App Intents), MCP,
  and CLI adapters. These define binding contracts; they do **not** claim
  runtime support.

## Result and receipt

Every invocation resolves to exactly one `ActionResult` variant, each carrying
an `ActionReceipt`:

- `completed` — with `entityRef` and the action's typed `data`.
- `handoff` — with a semantic `ActionHandoff` target (navigation actions like
  `chat.start`).
- `requires_input` — with `missingFields`; returned before any mutation.
- `in_progress` — with optional `retryAfterMs`.
- `unavailable` — with a structured `ActionError` (policy denial: auth,
  ownership, entitlement, quota, flags, provider, or client version).
- `failed` — with a structured `ActionError`.

The receipt minimum: `executionId`, `requestId`, `actionId`,
`schemaVersion`, `channel`, `status`, `startedAt`, `completedAt` when
terminal, `entityRef` when applicable. Receipts are recorded in the durable
`action_executions` ledger; raw contact PII never appears in generic telemetry
or the ledger.

## Stable errors

Every channel preserves the canonical code verbatim:

`AUTH_REQUIRED`, `PROFILE_REQUIRED`, `FORBIDDEN`, `ENTITLEMENT_REQUIRED`,
`ENTITLEMENT_UNVERIFIED`, `QUOTA_EXHAUSTED`, `FEATURE_DISABLED`,
`PROVIDER_UNAVAILABLE`, `CLIENT_UPGRADE_REQUIRED`, `VALIDATION_FAILED`,
`REQUIRES_INPUT`, `CONFIRMATION_REQUIRED`, `CONFLICT`, `IN_PROGRESS`,
`RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE`, `INTERNAL`.

There are no per-action domain error codes. Each error carries `code`, a safe
user-facing `messageKey`, `retryable`, optional field issues, and optional
upgrade/handoff metadata. MCP retains the code in `error.data`; the CLI maps
documented exit codes; native clients localize presentation from `messageKey`.
Adapters never flatten an error to an untyped string, never invent codes, and
never branch on message text.

## Hard invariants

1. One authenticated, profile-scoped resolver/dispatcher owns business
   policy. This package declares contracts only — no entitlement, quota,
   feature-flag, or persistence logic executes here.
2. A durable `action_executions` replay/reconciliation ledger is required
   before any real write is routed through these contracts.
3. Canonical entitlement, quota, feature-flag, validation, idempotency, and
   error semantics live centrally; adapters are native presentation only.
4. The public per-artist MCP endpoint never receives authenticated workspace
   writes — no action's `supportedChannels` includes that surface;
   owner-workspace MCP is a separate, new authenticated adapter.
5. No binding may claim runtime support without a real product surface and a
   runtime receipt; unbuilt bindings stay contract-only.

## Durable idempotency

Every write uses the durable `action_executions` ledger with unique identity:

`actorUserId + profileId + actionId + idempotencyKey`

The ledger persists the action/schema version and channel, the input hash
(never raw generic PII), the reservation status (`reserved` / `in_progress` /
`completed` / `failed`), the preallocated target entity UUID where applicable,
the redacted result/error code, and timestamps under a bounded
expiry/retention policy.

Rules:

1. Same key and same input returns the existing in-progress or terminal
   semantic result.
2. Same key with a different input hash returns `CONFLICT`.
3. Concurrent calls cannot create two entities.
4. The target entity ID is preallocated before the domain mutation, so a
   retry can reconcile a crash after insert but before ledger completion.
5. External/destructive actions require a short-lived confirmation token
   bound to actor, profile, action, schema version, and input hash.

The Redis lock helper is not sufficient (it releases the lock and cannot
replay outcomes), and the dashboard idempotency table is not sufficient for
crash reconciliation. Reservation/replay is modeled on the existing chat turn
IDs and uniqueness constraints.

## Evolution rules

- Action IDs are permanent. Never rename, reuse, or delete a shipped ID.
- Additive optional fields may remain within a version.
- Breaking input/output changes increment the action's integer
  `schemaVersion`; the prior version is retained through a declared
  deprecation/sunset window (`deprecatedAt`/`sunsetAt`).
- A changed outcome/effect receives a new action ID.
- TypeScript, JSON Schema/OpenAPI, MCP descriptors, CLI help, and Swift
  identifiers/parameter types are generated or parity-tested from the one
  canonical manifest; CI fails on generated-artifact or registry/adapter
  drift.

## Guardrail tests

- `manifest.test.ts` — pins the approved vocabulary exactly: the stable action
  IDs in order, required descriptor metadata, the exact stable error code
  list, invocation-envelope context ownership (`profileId`/`channel`/
  `clientVersion`/`idempotencyKey` live in the envelope, never in domain
  inputs), the six-status result union, and `chat.start`'s navigation-handoff
  semantics.
- `schema-parity.test.ts` — committed generated artifacts match regeneration
  byte-for-byte; regeneration is deterministic; every artifact is valid JSON.
- `policy-ownership.test.ts` — this package contains no executable business
  policy (no entitlement evaluation, env access, network, or app imports)
  and `bindings/` stays documentation-only.
