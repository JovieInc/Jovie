# Canonical Actions follow-up sequence (JOV-5041)

The follow-up issues to file, in the approved rollout-program order from the
founder-approved contract (§ Rollout program). Step 1 is this ticket
(foundation: `packages/action-contracts` + [INVENTORY.md](./INVENTORY.md) +
[MIGRATION_MAP.md](./MIGRATION_MAP.md)). **Step 1 is drafted, not accepted:**
the contract package and these docs were re-cut to the approved contract and
acceptance is pending the semantic re-review. Steps 2–11 follow the approved
program.

**Status of this list:** these are prepared drafts. Issues are filed in Linear
when the founder/orchestrator approves each phase — not before. Each step lists
its dependencies; do not start a step whose dependencies are not merged. One
writer owns the foundation registry and dispatcher (steps 2–3); domain and
client adapters parallelize only after that contract is merged and
version-locked.

All steps target the approved wire shapes: `ActionDescriptor` (integer
`schemaVersion`, `titleKey`/`descriptionKey`, `effect`, `confirmation`,
`supportedChannels`, `requirements`), `ActionInvocation` with
`context { profileId, channel, clientVersion }` + top-level `idempotencyKey`,
the six-status `ActionResult` union with `ActionReceipt`, the stable error
vocabulary, and the durable `action_executions` ledger keyed on
`actorUserId + profileId + actionId + idempotencyKey`.

---

## Step 1 — Baseline and inventory (this ticket)

- **Proposed Linear title:** `Canonical Actions: baseline, inventory, and contract foundation`
- **Scope:** Measure current completion/error/latency baselines for the four
  actions' legacy entry points; enumerate call sites and active ownership
  ([INVENTORY.md](./INVENTORY.md)); land the contract package with the
  manifest, descriptor/invocation/result schemas, stable error vocabulary,
  codegen + parity guard, and read-only authenticated discovery
  (`GET /api/v1/actions`).
- **Acceptance:** pending the semantic re-review of the corrected contract
  package against the founder-approved spec.
- **Depends on:** nothing.

## Step 2 — Foundation PR

- **Proposed Linear title:** `Canonical Actions: foundation — manifest, schemas, discovery`
- **Scope:** Merge the contract package and the read-only authenticated
  discovery endpoint: one `ResolvedActionCapability` per manifest action with
  `available`/`visibility`/`reasonCode`/`retryable`/`requirements`/`quota`/
  `upgrade`. Discovery is advisory UX only — never authorization. Wire the
  capability resolver to `getCurrentUserEntitlements()` +
  `ENTITLEMENT_REGISTRY`; preserve degraded entitlement verification as the
  distinct `ENTITLEMENT_UNVERIFIED` reason rather than widening access. No
  action is invocable yet.
- **Out of scope:** The dispatcher, the ledger, any write path, any client
  change, any new action IDs.
- **Depends on:** Step 1 acceptance.

## Step 3 — Dispatcher PR

- **Proposed Linear title:** `Canonical Actions: dispatcher + action_executions ledger`
- **Scope:** Create the durable `action_executions` ledger (migration-guarded)
  and the one server action dispatcher in `apps/web`: auth → requested-profile
  ownership proof → entitlement/quota → flags/provider/client-version →
  confirmation policy, then domain executor invocation, redacted result
  recording, and durable `ActionReceipt` return. Ledger identity is
  `actorUserId + profileId + actionId + idempotencyKey`; same key + same input
  hash replays the recorded in-progress/terminal result; same key + different
  input hash returns `CONFLICT`; concurrent calls cannot create two entities;
  target entity IDs are preallocated before the domain mutation;
  external/destructive actions require a short-lived confirmation token bound
  to actor, profile, action, schema version, and input hash. Model
  reservation/replay on the existing chat turn IDs and uniqueness constraints —
  the Redis lock helper and the dashboard idempotency table are not sufficient.
  Ship with resolver unit tests and ledger replay/reconciliation tests. No
  action is routed through it yet.
- **Out of scope:** Migrating any existing route, server action, or chat tool;
  any client change.
- **Depends on:** Step 2.

## Step 4 — `chat.start` canary

- **Proposed Linear title:** `Canonical Actions: chat.start canary through dispatcher`
- **Scope:** Route `chat.start` — the non-mutating navigation action — through
  discovery + invocation and return the `handoff` result with semantic
  destination `chat.new`. Web executes the typed local handoff immediately for
  latency, derived from the same manifest and capability result; remote clients
  invoke the endpoint for the same semantic handoff. Verify: no empty
  conversation is ever persisted (a conversation is reserved only when the
  first message is submitted and acknowledged), no message quota is consumed,
  cookie and bearer identities produce equivalent decisions, and canary
  completion rate / p95 latency regress no more than 5% against measured
  direct-path baselines. Verified with the existing cron canary
  (`apps/web/app/api/cron/auth-signup-onboarding-canary/route.ts:114`) and
  Promptfoo eval harness.
- **Out of scope:** Migrating the legacy chat-turn routes
  (`POST /api/chat`, `/api/mobile/v1/chat/turns`, welcome-chat), the anonymous
  onboarding chat path, deleting any legacy code, streaming-protocol changes.
  `chat.start` is a handoff canary, not a chat-turn migration.
- **Depends on:** Step 3.

## Step 5 — `contact.create` first write

- **Proposed Linear title:** `Canonical Actions: contact.create first write via dispatcher`
- **Scope:** First real mutation through the dispatcher + ledger, proving
  quota, validation, durable replay, and PII redaction. Migrate the
  `saveContact` server action
  (`apps/web/app/app/(shell)/dashboard/contacts/actions.ts:135`) to canonical
  `contact.create` so `contactsLimit` enforcement, canonical validation (at
  least one usable contact channel; incomplete submissions get
  `requires_input` with field issues before mutation), and idempotency come
  from the resolver; close the `processProfileExtraction` entitlement bypass by
  routing its `creator_contacts` write through the same executor. Duplicate
  submissions replay the recorded result instead of creating duplicates; the
  generic ledger and analytics carry no raw contact PII.
- **Out of scope:** Fan-capture fan-in (`/api/notifications/subscribe`, promo
  OTP, SMS intents/webhook) migration; anonymous `audience_members` telemetry
  consolidation; platform-level changelog/waitlist entities.
- **Depends on:** Steps 3–4.

## Step 6 — `task.create` + `release.create` domain slices

- **Proposed Linear title:** `Canonical Actions: extract task.create and release.create into dispatcher`
- **Scope:** Extract/migrate `task.create`, then `release.create`; current
  server actions become thin adapters of the same domain services. For tasks:
  the five server actions and the `manageTasks` chat tool (4 insert sites, 3
  release-ownership-check copies, 3 task-number allocators, 4 `position=max+1`
  computations); users without Tasks workspace access get a truthful
  `unavailable` result with entitlement reason + upgrade handoff, never a
  silent no-op. For releases: `createRelease`, `createReleaseTool`, album-art
  `create-release-and-apply`, and audio-upload draft single (one `releaseType`
  enum, one slug strategy, insert-or-replay semantics, first server-side
  `canCreateManualReleases` enforcement). `release.create` creates manual
  drafts only — import/sync/publish/distribute stay separate actions. Resolve
  the canonical form owner (Library/release domain code, not the legacy
  `/app/dashboard/releases` route) before the adapter lands. Spotify ingestion
  shares the canonical slug/validation helpers but stays a sync process outside
  the per-action ledger.
- **Out of scope:** Client/UI changes beyond swapping the call target; Spotify
  sync-scheduling changes; deleting legacy paths (step 11).
- **Depends on:** Steps 3–5.

## Step 7 — Web adoption

- **Proposed Linear title:** `Canonical Actions: web adoption — sidebar, CmdK, native forms`
- **Scope:** Ship the approved sidebar split control (direct `New Chat` segment
  plus menu items `New Release…`, `Add Contact`, `New Task`) as the first
  pure-presentation client of the dispatcher, plus CmdK and other eligible
  surfaces and native route-owned web forms that gather input and invoke the
  canonical action on submit (no generic dynamic form DSL). Render the
  six-status result union, including entitlement-denial upgrade CTAs from the
  structured error's `upgrade` metadata instead of client-side string matching.
  Remove duplicated client-side validation (e.g. `useContactsManager.ts:288`)
  for any action these surfaces touch.
- **Out of scope:** New actions, native clients, MCP/CLI, sidebar visual
  redesign.
- **Depends on:** Steps 3–6 (the actions it presents must be
  dispatcher-backed).

## Step 8 — Existing client adoption: iOS / App Intents + Electron

- **Proposed Linear title:** `Canonical Actions: iOS App Intents + Electron adapters`
- **Scope:** Make the existing native surfaces presentation-only adapters. iOS:
  `MobileChatClient`/`ChatRepository` and the App Intents in
  `apps/ios/Jovie/Features/Intents/JovieAppIntents.swift` consume
  dispatcher-backed endpoints; Swift IDs and parameter contracts are
  generated/parity-checked at build time; availability is re-resolved at
  runtime; missing inputs use native dialogs. The Swift binding flips to
  runtime-backed only with a shipped receipt. Electron: tray/menu actions
  (`apps/desktop/src/tray.ts`, `main.ts:1654`) consume the same action adapter;
  remove the inert standalone New Message event once parity is proven.
- **Out of scope:** WidgetKit (step 10), new App Intents beyond existing
  actions, macOS MenuMonitor (not an actions surface), offline queue redesign.
- **Depends on:** Steps 3–6 (`chat.start` canary at minimum; task/release
  extraction for the intents that create them).

## Step 9 — Machine adapters: owner-workspace MCP + CLI

- **Proposed Linear title:** `Canonical Actions: authenticated owner-workspace MCP server + product CLI`
- **Scope:** Ship two new surfaces, both dispatcher adapters from day one: (1)
  a new authenticated owner-workspace MCP server whose tool descriptors are
  generated from the manifest and delegate to the dispatcher, with real MCP
  auth (OAuth/API key) — the existing public per-artist endpoint
  (`apps/web/app/api/mcp/[username]/route.ts`) is untouched and never receives
  workspace writes; (2) the first product CLI package (none exists today) with
  generated commands/schema help from the manifest, a Jovie OAuth client,
  scoped browser/PKCE authentication, packaging, and distribution. MCP retains
  the stable error code in `error.data`; the CLI maps documented exit codes;
  neither branches on message text. Both bindings flip from contract-only only
  when the surfaces ship with runtime receipts.
- **Out of scope:** Modifying the public per-artist MCP endpoint's tools or
  auth model; merch tool migration; exposing actions not yet dispatcher-backed.
- **Depends on:** Steps 3–7 (all four actions dispatcher-backed; web adapter
  proven as the presentation-only reference).

## Step 10 — New client slices: WidgetKit / new clients

- **Proposed Linear title:** `Canonical Actions: WidgetKit and new-client adapter slices`
- **Scope:** Net-new client surfaces (the WidgetKit extension and any
  macOS-native App Intents) ship adapter-first against the dispatcher — they
  never touch legacy paths. Widgets use the generated ID and input contract,
  then invoke or open the canonical native handoff. Each new binding enters the
  manifest as contract-only and flips to runtime-backed only with a real
  product surface and runtime receipt; no support is claimed before the
  products exist.
- **Out of scope:** New action IDs (separate contract evolution per the
  versioning rules), retrofitting surfaces not in the approved client list.
- **Depends on:** Steps 3–9 (dispatcher plus at least one native and one
  machine adapter proven).

## Step 11 — Removal after parity

- **Proposed Linear title:** `Canonical Actions: remove superseded paths after parity`
- **Scope:** Delete superseded local descriptors, callback buses, and legacy
  write internals per path, only after the per-action parity criteria in
  [MIGRATION_MAP.md](./MIGRATION_MAP.md) are met with production evidence
  (canary + replay tests + telemetry) and rollback receipts (per-action/channel
  kill switches verified in staging and production). Each deletion PR removes
  the dead code, its tests, and its docs references together. Includes:
  `POST /api/chat/conversations` (obsolete once callers take the `chat.new`
  handoff with no empty-conversation persistence), the welcome-chat route's
  creation internals (with the onboarding convergence decision), `saveContact`'s
  own validation/entitlement copies, the three `requireReleaseAccess` copies,
  duplicated task-number/position logic, the dashboard `createRelease`
  slug/validation fork, and the per-surface merch gate stacks where superseded.
  Close out with a final sweep: zero remaining non-dispatcher write paths for
  the four actions (grep-level audit against [INVENTORY.md](./INVENTORY.md)),
  removal of now-unused schemas/helpers (e.g. the unused `insertTaskSchema`,
  forked message validators), `docs/API_ROUTE_MAP.md` and index updates, and a
  post-implementation note on what ledger replay changed in production
  behavior. Deleted paths are removed, not retained as permanent fallbacks.
- **Out of scope:** Any path whose parity criterion is not met (file a
  follow-up instead); the anonymous onboarding chat surface unless its own
  convergence decision has been made; Spotify ingestion sync internals; new
  features, actions, or clients.
- **Depends on:** Steps 4–10 for the relevant action/surface; per-path parity
  evidence attached to each deletion PR.
