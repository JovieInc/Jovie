# Swift binding contract (contract-only)

Status: **contract-only**. No Swift runtime product ships this binding yet;
nothing here may be advertised as supported until a real surface exists with
a runtime receipt.

## Mapping

- Each action maps to one `AppIntent` conforming type named from the action
  ID: `chat.start` → `StartChatIntent`, `contact.create` →
  `CreateContactIntent`, `release.create` → `CreateReleaseIntent`,
  `task.create` → `CreateTaskIntent`.
- Input schemas (`generated/schemas/<id>.input.json`) generate one Swift
  `Codable` struct per action. Optional JSON fields become optional Swift
  properties; enums become `String`-backed `CaseIterable` enums.
- The invocation envelope is owned by the adapter, not the generated input
  structs: `profileId`, `channel` (`ios` or `app_intent`), `clientVersion`,
  and the top-level `idempotencyKey` are populated at the call site. Domain
  input schemas never carry these fields.
- Every intent must generate `idempotencyKey` (UUIDv4) at the call site and
  persist it across retries of the same user gesture. Retrying with a new
  key is a new invocation.
- Results decode the six-status `ActionResult` union:
  - `completed` — read `data`/`entityRef`.
  - `handoff` — navigate to the semantic target natively; for `chat.start`
    the target is `chat.new`, mapped to the native Chat tab. No empty
    conversation is created; the conversation is reserved only when the first
    message is submitted and acknowledged, and opening chat consumes no
    message quota.
  - `requires_input` — present a native dialog for `missingFields`.
  - `in_progress` — retry after `retryAfterMs` with the same key.
  - `unavailable` / `failed` — map `error.code` (stable vocabulary only) to a
    localized presentation from `error.messageKey`, using optional
    `upgrade`/`handoff` metadata.
  Swift code never branches on message text and never invents error codes.
- Auth: intents run only against the authenticated owner workspace
  (Bearer session from the first-party auth handoff,
  `packages/auth-routing`). `context.profileId` is requested scope — the
  client sends the profile it believes is active, the server proves
  ownership, and the client must tolerate `AUTH_REQUIRED`,
  `PROFILE_REQUIRED`, `FORBIDDEN`, and `ENTITLEMENT_REQUIRED`.

## Forbidden in the Swift adapter

- Duplicating validation rules client-side beyond what the generated schema
  provides (presentation hints are fine; policy is not).
- Entitlement, quota, or feature-flag evaluation.
- Local retry loops that regenerate `idempotencyKey`.
