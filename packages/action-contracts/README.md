# @jovie/action-contracts

Versioned contract foundation for the Jovie Canonical Actions platform
(JOV-5041). This package is the **single owner of action identity** for the
four stable actions:

| ID | Purpose |
| --- | --- |
| `chat.start` | Create/resume an authenticated AI chat conversation |
| `contact.create` | Create an audience contact (email/SMS subscriber) |
| `release.create` | Create a discography release |
| `task.create` | Create a workspace task |

## What lives here

- `manifest.ts` — the canonical registry: one `ActionDefinition` per stable
  ID with input/output/error zod schemas, capability/discovery metadata,
  auth scope, idempotency requirements, and evolution rules.
- `envelope.ts` — the canonical result envelope (`{ ok, data|error, meta }`)
  and structured error shape that every adapter maps to its transport.
- `generated/` — deterministic JSON Schema (draft 2020-12) and OpenAPI 3.1
  artifacts derived from the manifest. Regenerate with
  `pnpm --filter @jovie/action-contracts run generate`; CI and
  `schema-parity.test.ts` fail on drift.
- `bindings/` — contract-only specifications for Swift (App Intents), MCP,
  and CLI adapters. These define binding contracts; they do **not** claim
  runtime support.

## Hard invariants

1. One authenticated, profile-scoped resolver/dispatcher owns business
   policy. This package declares contracts only — no entitlement, quota,
   feature-flag, or persistence logic executes here.
2. A durable `action_executions` replay/reconciliation ledger is required
   before any real write is routed through these contracts.
3. Canonical entitlement, quota, feature-flag, validation, idempotency, and
   error semantics live centrally; adapters are native presentation only.
4. The public per-artist MCP endpoint never receives authenticated workspace
   writes (`auth.publicArtistMcpWritable === false` on every action).
5. No binding may claim runtime support (`existing`) without a real product
   surface and a runtime receipt; unbuilt bindings stay `contract-only`.

## Evolution rules

- Action IDs are permanent. Never rename, reuse, or delete a shipped ID.
- Input/output changes are additive only: new optional fields, new enum
  members at the end, new error codes.
- Anything breaking (renaming/removing fields, tightening validation on
  existing inputs, changing error semantics) ships as `version: '2'` of the
  same ID, with v1 kept until all adapters migrate.
- Deprecation requires a successor ID or version to exist first.

## Guardrail tests

- `manifest.test.ts` — duplicate/unapproved action IDs, required contract
  metadata, structured errors on every action, entitlement-key hygiene.
- `schema-parity.test.ts` — committed artifacts match regeneration
  byte-for-byte; input schemas reject missing `idempotencyKey`/`profileId`.
- `policy-ownership.test.ts` — this package contains no executable business
  policy (no entitlement evaluation, env access, network, or app imports)
  and `bindings/` stays documentation-only.
