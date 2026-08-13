# Canonical Actions follow-up sequence (JOV-5041)

The follow-up issues to file after this foundation, in the approved program
order. Step 1 is this ticket (foundation: `packages/action-contracts` +
[INVENTORY.md](./INVENTORY.md) + [MIGRATION_MAP.md](./MIGRATION_MAP.md)) and is
already done. Steps 2–10 are the program sequence; step 11 is the explicit
post-deletion cleanup/verification pass.

**Status of this list:** these are prepared drafts. Issues are filed in Linear
when the founder/orchestrator approves each phase — not before. Each step lists
its dependencies; do not start a step whose dependencies are not merged.

---

## Step 2 — Dispatcher + durable ledger

- **Proposed Linear title:** `Canonical Actions: dispatcher + action_executions ledger`
- **Scope:** Create the durable `action_executions` table (migration-guarded)
  and the authenticated, profile-scoped resolver/dispatcher in `apps/web` that
  consumes `packages/action-contracts`: validates input against the manifest
  zod schemas, evaluates `action.entitlementKeys` via
  `apps/web/lib/entitlements/registry.ts`, applies quota/feature-flag checks,
  enforces `idempotencyKey` with `onConflict: 'replay'` semantics against the
  ledger (`meta.replayed` on repeat, `IDEMPOTENCY_CONFLICT` on payload
  mismatch), and emits the canonical envelope (`{ ok, data|error, meta }`) with
  `COMMON_ERROR_CODES` + per-action domain codes. No action is routed through
  it yet in this step; ship with resolver unit tests and ledger replay tests.
- **Out of scope:** Migrating any existing route, server action, or chat tool;
  any client change; any new action IDs.
- **Depends on:** Step 1 (foundation).

## Step 3 — `chat.start` canary

- **Proposed Linear title:** `Canonical Actions: chat.start canary through dispatcher`
- **Scope:** Route one production chat-start path (primary candidate:
  `POST /api/mobile/v1/chat/turns`, whose `reserveChatTurn` semantics are the
  closest existing model for ledger replay) through the dispatcher with no
  user-visible change. Generalize `reserveChatTurn`
  (`apps/web/lib/chat/turns.ts:222`) replay outcomes onto `action_executions`.
  Verify with shadow comparisons against the legacy path plus the existing cron
  canary (`apps/web/app/api/cron/auth-signup-onboarding-canary/route.ts:114`)
  and Promptfoo eval harness.
- **Out of scope:** The anonymous onboarding chat path, web `/api/chat`
  migration, deleting any legacy code, streaming-protocol changes.
- **Depends on:** Step 2.

## Step 4 — `contact.create` real write

- **Proposed Linear title:** `Canonical Actions: contact.create real write via dispatcher`
- **Scope:** First mutation written through the dispatcher + ledger. Migrate
  the `saveContact` server action
  (`apps/web/app/app/(shell)/dashboard/contacts/actions.ts:135`) to canonical
  `contact.create` so `contactsLimit` enforcement, validation, and idempotency
  come from the resolver; close the `processProfileExtraction` entitlement
  bypass by routing its `creator_contacts` write through the resolver too.
  Duplicate submissions must replay (`meta.replayed`) instead of creating
  duplicates.
- **Out of scope:** Fan-capture fan-in (`/api/notifications/subscribe`, promo
  OTP, SMS intents/webhook) migration; anonymous `audience_members` telemetry
  consolidation; platform-level changelog/waitlist entities.
- **Depends on:** Steps 2–3.

## Step 5 — `task.create` + `release.create` extraction

- **Proposed Linear title:** `Canonical Actions: extract task.create and release.create into dispatcher`
- **Scope:** Collapse the duplicated write paths into the resolver. For tasks:
  the five server actions and the `manageTasks` chat tool (4 insert sites, 3
  release-ownership-check copies, 3 task-number allocators, 4 `position=max+1`
  computations). For releases: `createRelease`, `createReleaseTool`, album-art
  `create-release-and-apply`, and audio-upload draft single (one `releaseType`
  enum, one slug strategy, insert-or-replay semantics, first server-side
  `canCreateManualReleases` enforcement). Spotify ingestion shares the
  canonical slug/validation helpers but stays a sync process outside the
  per-action ledger.
- **Out of scope:** Client/UI changes beyond swapping the call target; Spotify
  sync-scheduling changes; deleting legacy paths (that is step 10).
- **Depends on:** Steps 2–4.

## Step 6 — Approved web sidebar adapter

- **Proposed Linear title:** `Canonical Actions: web sidebar adapter (presentation-only client)`
- **Scope:** Ship the first pure-presentation web client (the approved sidebar
  surface) that invokes canonical actions through the dispatcher and renders
  the canonical envelope, including entitlement-denial upgrade CTAs rendered
  from structured errors instead of client-side string matching. Remove the
  duplicated client-side validation (e.g. `useContactsManager.ts:288`) for any
  action the sidebar touches.
- **Out of scope:** New actions, native clients, MCP/CLI, sidebar visual
  redesign.
- **Depends on:** Steps 2–5 (the actions it presents must be dispatcher-backed).

## Step 7 — iOS / App Intents + Electron adapters

- **Proposed Linear title:** `Canonical Actions: iOS App Intents + Electron adapters`
- **Scope:** Make the native surfaces presentation-only adapters. iOS:
  `MobileChatClient`/`ChatRepository` and the App Intents in
  `apps/ios/Jovie/Features/Intents/JovieAppIntents.swift` consume the
  dispatcher-backed endpoints; the Swift binding spec in
  `packages/action-contracts/bindings/` flips to `existing` only with a shipped
  runtime receipt. Electron: tray/menu actions (`apps/desktop/src/tray.ts`,
  `main.ts:1654`) route through dispatcher-backed endpoints instead of
  deep-link-only behavior where a canonical action applies.
- **Out of scope:** WidgetKit (step 9), new App Intents beyond existing
  actions, macOS MenuMonitor (not an actions surface), offline queue redesign.
- **Depends on:** Steps 2–5 (chat.start canary at minimum; task/release
  extraction for the intents that create them).

## Step 8 — Authenticated owner-workspace MCP + CLI

- **Proposed Linear title:** `Canonical Actions: authenticated owner-workspace MCP server + product CLI`
- **Scope:** Ship two new surfaces, both dispatcher adapters from day one: (1)
  a new authenticated owner-workspace MCP server exposing the four canonical
  actions with real MCP auth (OAuth/API key) — the existing public per-artist
  endpoint (`apps/web/app/api/mcp/[username]/route.ts`) is untouched and never
  receives workspace writes (`publicArtistMcpWritable === false`); (2) the
  first product CLI package (none exists today) implementing the CLI binding
  spec. Both bindings flip to `existing` only when the surfaces ship with
  runtime receipts.
- **Out of scope:** Modifying the public per-artist MCP endpoint's tools or
  auth model; merch tool migration; exposing actions not yet dispatcher-backed.
- **Depends on:** Steps 2–6 (all four actions dispatcher-backed; web adapter
  proven as the presentation-only reference).

## Step 9 — WidgetKit / new-client slices

- **Proposed Linear title:** `Canonical Actions: WidgetKit and new-client adapter slices`
- **Scope:** Net-new client surfaces (WidgetKit and any other approved new
  clients) ship adapter-first against the dispatcher — they never touch legacy
  paths. Each new binding enters the manifest as `contract-only` and flips to
  `existing` only with a real product surface and runtime receipt.
- **Out of scope:** New action IDs (separate contract evolution per the
  additive-only/new-version rules), retrofitting surfaces not in the approved
  client list.
- **Depends on:** Steps 2–8 (dispatcher plus at least one native and one
  machine adapter proven).

## Step 10 — Old-path deletion after parity

- **Proposed Linear title:** `Canonical Actions: delete legacy entry paths after parity`
- **Scope:** Delete legacy routes/server actions/chat-tool write internals
  per path, only after the per-action parity criteria in
  [MIGRATION_MAP.md](./MIGRATION_MAP.md) are met with production evidence
  (canary + replay tests + telemetry). Each deletion PR removes the dead code,
  its tests, and its docs references together. Includes: `POST
  /api/chat/conversations`, the welcome-chat route's creation internals,
  `saveContact`'s own validation/entitlement copies, the three
  `requireReleaseAccess` copies, duplicated task-number/position logic, the
  dashboard `createRelease` slug/validation fork, and the per-surface merch
  gate stacks where superseded.
- **Out of scope:** Any path whose parity criterion is not met (file a
  follow-up instead); the anonymous onboarding chat surface unless its own
  convergence decision has been made; Spotify ingestion sync internals.
- **Depends on:** Steps 3–9 for the relevant action/surface; per-path parity
  evidence attached to each deletion PR.

## Step 11 — Post-deletion cleanup and verification

- **Proposed Linear title:** `Canonical Actions: post-deletion cleanup + verification sweep`
- **Scope:** Final sweep after step 10 completes: verify zero remaining
  non-dispatcher write paths for the four actions (grep-level audit against
  [INVENTORY.md](./INVENTORY.md) entry points), remove now-unused schemas and
  helpers (e.g. the unused `insertTaskSchema`, forked message validators,
  duplicated `audience_members` upsert helpers if consolidated), update
  `docs/API_ROUTE_MAP.md` and related indexes, mark all `contract-only`
  bindings honestly, and confirm the manifest, generated artifacts, and
  `schema-parity` tests still pass byte-for-byte. Close out with a
  post-implementation note capturing what the ledger replay semantics changed
  in production behavior.
- **Out of scope:** New features, new actions, new clients.
- **Depends on:** Step 10 fully merged.
