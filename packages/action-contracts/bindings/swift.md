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
- Every intent must generate `idempotencyKey` (UUIDv4) at the call site and
  persist it across retries of the same user gesture. Retrying with a new
  key is a new action.
- Results decode the canonical envelope: `ok == true` reads `data`;
  `ok == false` maps `error.code` to a localized presentation. Swift code
  never branches on `message` text and never invents error codes.
- Auth: intents run only against the authenticated owner workspace
  (Bearer session from the first-party auth handoff,
  `packages/auth-routing`). Profile scope comes from `profileId` resolved
  server-side; the client sends the profile it believes is active and must
  tolerate `PROFILE_REQUIRED` / `ENTITLEMENT_DENIED`.

## Forbidden in the Swift adapter

- Duplicating validation rules client-side beyond what the generated schema
  provides (presentation hints are fine; policy is not).
- Entitlement, quota, or feature-flag evaluation.
- Local retry loops that regenerate `idempotencyKey`.
