# Canonical Actions migration map (JOV-5041)

How each existing entry point in [INVENTORY.md](./INVENTORY.md) migrates onto
the Canonical Actions platform, in the approved program sequence. The contract
layer already exists: `packages/action-contracts` (manifest, `ActionDescriptor`
wire shapes, `ActionInvocation` envelope, six-status `ActionResult` union with
`ActionReceipt`, stable error vocabulary, generated JSON Schema / OpenAPI
artifacts, contract-only binding specs). Everything below it — the capability
resolver, the dispatcher, the durable ledger, and each adapter migration — is
follow-up work (see [FOLLOWUPS.md](./FOLLOWUPS.md)).

## Canonical wire shapes (what every migration targets)

- **Descriptor:** `ActionDescriptor` — `id`, integer `schemaVersion`,
  `titleKey`/`descriptionKey`, `inputSchema`/`outputSchema`,
  `effect` (`navigation` | `internal_write` | `external_write` | `destructive`),
  `confirmation` (`none` | `required`), `supportedChannels`, `requirements`,
  optional `minimumClientVersions`/`deprecatedAt`/`sunsetAt`.
- **Invocation:** `ActionInvocation` — `schemaVersion`, top-level
  `idempotencyKey`, `context: { profileId, channel, clientVersion? }`,
  `input`, optional `confirmationToken`. Context fields live in the envelope,
  never inside domain input schemas.
- **Result:** the six-status `ActionResult` union — `completed` (with
  `entityRef`/`data`), `handoff` (with `ActionHandoff`), `requires_input`
  (with `missingFields`), `in_progress` (with optional `retryAfterMs`),
  `unavailable`, and `failed` — every variant carrying an `ActionReceipt`.
- **Errors:** the stable vocabulary only — `AUTH_REQUIRED`,
  `PROFILE_REQUIRED`, `FORBIDDEN`, `ENTITLEMENT_REQUIRED`,
  `ENTITLEMENT_UNVERIFIED`, `QUOTA_EXHAUSTED`, `FEATURE_DISABLED`,
  `PROVIDER_UNAVAILABLE`, `CLIENT_UPGRADE_REQUIRED`, `VALIDATION_FAILED`,
  `REQUIRES_INPUT`, `CONFIRMATION_REQUIRED`, `CONFLICT`, `IN_PROGRESS`,
  `RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE`, `INTERNAL`. No per-action domain
  error codes; adapters never invent codes or branch on message text.
- **Idempotency:** durable `action_executions` ledger keyed on
  `actorUserId + profileId + actionId + idempotencyKey`. Same key + same input
  hash replays the recorded result; same key + different input hash returns
  `CONFLICT`; target entity IDs are preallocated before the domain mutation;
  external/destructive actions require a confirmation token bound to actor,
  profile, action, schema version, and input hash.

## Program sequence (approved order, from the contract's rollout program)

1. **Baseline and inventory** — measure current completion/error/latency;
   enumerate call sites and ownership ([INVENTORY.md](./INVENTORY.md)).
2. **Foundation PR** — contract package, manifest, schemas, stable errors,
   codegen/parity guard, read-only authenticated discovery.
3. **Dispatcher PR** — auth/profile resolver, entitlement/flag/version policy,
   execution ledger migration, replay/reconciliation, telemetry/redaction.
4. **`chat.start` canary** — first action routed through the dispatcher;
   verifies cross-client handoff semantics (it is non-mutating).
5. **`contact.create` first write** — proving quota, validation, durable
   replay, and PII redaction.
6. **Domain slices** — extract/migrate `task.create`, then `release.create`;
   current server actions become thin adapters.
7. **Web adoption** — approved sidebar split control, CmdK/other eligible
   surfaces, native web forms.
8. **Existing client adoption** — iOS/App Intents and Electron tray/shell.
9. **Machine adapters** — authenticated owner-workspace MCP and product CLI.
10. **New client slices** — WidgetKit extension and any macOS-native App
    Intents.
11. **Removal** — delete superseded local descriptors/callback buses only
    after parity and rollback receipts.

Two hard boundaries apply to the whole map:

- **The public per-artist MCP endpoint (`apps/web/app/api/mcp/[username]/route.ts`)
  never receives authenticated workspace writes.** Owner-workspace MCP is a
  *new*, separately authenticated server (step 9); the existing public endpoint
  keeps its read tools and its cookie-authed merch writes untouched until then.
- **No binding may claim runtime support before a real product surface exists.**
  CLI, WidgetKit, and Siri/App Intents bindings stay contract-only until the
  actual client ships with a runtime receipt.

## What the dispatcher absorbs vs. what adapters keep

Per the approved contract:

- **Dispatcher absorbs (canonical, server-side, one copy):** input validation
  against the manifest schemas; auth and requested-profile ownership proof;
  entitlement evaluation against declared `requirements` via
  `getCurrentUserEntitlements()` + `ENTITLEMENT_REGISTRY`
  (`apps/web/lib/entitlements/registry.ts`); quota/rate limiting; feature-flag
  and client-version readiness; durable idempotency reservation and replay
  against the `action_executions` ledger; the stable error taxonomy; the
  domain mutation via canonical domain services; and the redacted receipt
  record.
- **Adapters keep (presentation only):** transport framing (SSE/NDJSON
  streaming, JSON-RPC envelope, server-action serialization, IPC), auth-token
  acquisition and refresh, rendering, and local UX state. Adapters never
  re-implement validation, entitlement, quota, idempotency, or error mapping.

## `chat.start` migration — the navigation/handoff canary

Contract: `packages/action-contracts/actions/chat-start.ts`. Effect:
`navigation`; confirmation: `none`; requirements: `auth` +
`profile_ownership`; no required input. The result is `handoff` with semantic
destination `chat.new`, mapped per adapter to `/app/chat`, the native Chat
tab, or a client link. **It never creates, resumes, or persists an empty
conversation** — a conversation is reserved only when the first message is
submitted and acknowledged — and it consumes no message quota.

This migration is a **canary of navigation/handoff semantics, not a mutation**:
it proves discovery, invocation, the handoff result variant, and cross-client
adapters without touching the write path or the message-turn pipeline.

| Current entry point | Migration target |
| --- | --- |
| `POST /api/chat` (`apps/web/app/api/chat/route.ts:2326`) | Legacy chat-turn path. Unchanged by the canary; the dispatcher phase maps it as a separate message-submission surface, not as `chat.start`. Web's typed local `chat.new` handoff may execute immediately for latency, derived from the same manifest and capability result. |
| Onboarding mode of same route (`onboarding-handler.ts:188`) | Stays a separate anonymous surface in the canary phase; canonical `chat.start` is authenticated/profile-scoped. Onboarding convergence is deferred and tracked as its own decision. |
| `POST /api/chat/conversations` (`app/api/chat/conversations/route.ts:85`) | Legacy empty-conversation creator. Becomes obsolete: `chat.start` returns the `chat.new` handoff with **no** persisted conversation, and the conversation is reserved only on first acknowledged message. Callers migrate to the handoff; the route is removed in step 11 after parity. |
| `POST /api/onboarding/welcome-chat` (`app/api/onboarding/welcome-chat/route.ts:33`) | Legacy bootstrap path. Its claim/reuse semantics stay where they are during the canary; mapping is decided with the onboarding convergence decision above. |
| `POST /api/mobile/v1/chat/turns` (`app/api/mobile/v1/chat/turns/route.ts:11`, handler `lib/mobile/chat/turn-handler.ts:110`) | Legacy chat-turn path serving iOS. Its `reserveChatTurn` reservation/replay behavior is the model the durable ledger generalizes — but turn execution is a message-submission concern, not part of `chat.start`. iOS adopts the `chat.new` handoff for navigation. |
| Clients: `useJovieChat.ts:417`, `OnboardingChat.tsx:117`, `/start` page, `HomepageIntent.tsx:43`, `MobileChatClient.swift:64`, Electron tray `new-message` | Presentation only; each maps the `chat.new` handoff to its native destination. No client keeps validation/normalizer logic for the action itself. |

**Dispatcher absorbs (for `chat.start`):** auth + profile-ownership proof and
receipt recording for the handoff invocation. Message-turn validation, quota,
and streaming remain on the existing turn pipeline during the canary; they are
mapped separately when the message-submission surface is addressed.

**Adapters keep:** SSE vs NDJSON framing on the turn routes,
`x-request-id`/streaming headers, Turnstile/session-cookie mechanics on the
anonymous onboarding surface, 401 token-refresh retry on iOS, and the native
rendering of the `chat.new` handoff (`/app/chat`, Chat tab, client link).

**Parity criterion (before any legacy path is deleted):** every production
caller that "opens chat" resolves `chat.start` through discovery/invocation and
renders the same semantic handoff on every enabled channel; no path inserts an
empty conversation; cookie and bearer identities produce equivalent decisions;
canary completion rate and p95 latency regress no more than 5% against the
measured direct-path baseline; the cron canary
(`app/api/cron/auth-signup-onboarding-canary/route.ts:114`) and Promptfoo eval
provider run with no score regression.

## `contact.create` migration

Contract: `packages/action-contracts/actions/contact-create.ts`. Effect:
`internal_write`; requirements include the `contactsLimit` entitlement key.
Canonical validation policy: at least one usable contact channel (email or
phone); incomplete surfaces receive `requires_input` with field issues before
any mutation. Quota exhaustion surfaces as the stable `QUOTA_EXHAUSTED` code.
Scope note: the canonical action covers **creator-owned contacts on the
authenticated profile**. Anonymous fingerprint tracking (`audience_members`) is
telemetry, not an action, and is out of scope for the dispatcher.

| Current entry point | Migration target |
| --- | --- |
| `POST /api/notifications/subscribe` (`app/api/notifications/subscribe/route.ts:49`, domain `lib/notifications/domain.ts:644`) | Fan-capture adapter. Validation, Pro/SMS gating, suppression, and dedup move to canonical policy behind the dispatcher. |
| `POST /api/notifications/verify-email-otp` (domain `lib/notifications/domain.ts:856`) | OTP confirmation stays a domain step, not a separate action. |
| Promo OTP pair (`app/api/promo-downloads/[id]/request-otp/route.ts:34`, `verify-otp/route.ts:40`) | Funnel into the same domain service; `otp-service.ts` upserts collapse into one canonical upsert. |
| `POST /api/notifications/sms-intents` (`route.ts:76`) + Twilio webhook (`app/api/webhooks/sms/route.ts:34` → `lib/notifications/sms-webhook.ts`) | SMS intent/consume pipeline keeps webhook mechanics; contact/subscription creation goes through the canonical path. Webhook dedup (`webhookEvents`) remains transport-level. |
| `saveContact` server action (`app/(shell)/dashboard/contacts/actions.ts:135`) | First canonical `contact.create` caller: `creator_contacts` write with `contactsLimit` enforced centrally at invoke time. Gains durable idempotency (top-level `idempotencyKey`) it lacks today. |
| `processProfileExtraction` (`lib/ingestion/flows/profile-processing.ts:119`) | Ingestion writes through the canonical executor so the `contactsLimit` bypass is closed. |
| Anonymous tracking (`audience/visit`, `audience/click`, `/s/[code]`, `/api/track`) | **Not actions.** Stay as telemetry upserts; the 6×-duplicated `audience_members` upsert is consolidated as a shared helper, not a canonical action. |
| Platform-level (`changelog/subscribe`, `waitlist`) | Out of scope — different entity (Jovie platform, not artist audience). |
| Clients: `useNotificationStatusQuery`, `useProfileNotificationsController`, `useSubscriptionForm`, `ProfilePacCard`, `useContactsManager`, `useDebouncedContactSave` | Presentation only; client-side `sanitizeContactInput` duplication (useContactsManager.ts:288) is deleted once server validation is canonical. |

**Dispatcher absorbs:** the three divergent Pro-gating mechanisms
(`lib/entitlements` vs raw `users.isPro` joins vs env flag), contact validation
(zod vs manual `sanitizeContactInput` vs `lib/notifications/validation`),
channel/consent rules, and durable ledger replay on top of the existing
unique-constraint upserts (including preallocated contact IDs for crash
reconciliation).

**Adapters keep:** OTP email/SMS delivery, Turnstile, honeypots, Twilio HMAC
verification, webhook claim-then-process, rate-limit headers, fan-facing copy.

**Parity criterion:** `saveContact` and `POST /api/notifications/subscribe`
both route through the dispatcher with shadow-write comparison showing zero
divergence on a production canary cohort; duplicate submissions replay the
originally recorded contact (same key + same input hash → recorded result;
different input hash → `CONFLICT`); `contactsLimit` denials return
`QUOTA_EXHAUSTED` (or `ENTITLEMENT_REQUIRED` / `ENTITLEMENT_UNVERIFIED` where
applicable) with `logEntitlementDenial` telemetry from exactly one code path;
the ledger and analytics contain no raw contact PII.

## `release.create` migration

Contract: `packages/action-contracts/actions/release-create.ts`. Effect:
`internal_write`; requirements include `canCreateManualReleases`. Creates only
a manual Jovie draft — import, sync, smart-link publication, distribution, and
chat-generated paid tools are separate actions with separate IDs. Slug
collisions and replays surface through the stable codes (`CONFLICT` on
idempotency-key/input mismatch), not bespoke per-action codes.

| Current entry point | Migration target |
| --- | --- |
| `createRelease` server action (`app/(shell)/dashboard/releases/actions.ts:2235`) | Replaced by dispatcher call. Server-side `canCreateManualReleases` enforcement appears for the first time (client-only today). Slug strategy unifies on `generateUniqueSlug` + preallocated release ID + ledger replay instead of raw `slugify` + unique-violation catch. |
| `createReleaseTool` (`app/api/chat/route.ts:1559`) | Chat tool becomes a dispatcher adapter; upsert-on-conflict overwrite semantics replaced by insert-or-replay. |
| Album-art `create-release-and-apply` (`app/api/chat/album-art/create-release-and-apply/route.ts:34` → `lib/services/album-art/apply.ts:219`) | Adapter keeps artwork-apply orchestration; release row creation goes through the dispatcher. Gating reconciles `canGenerateAlbumArt`/`ALBUM_ART_GENERATION` with `canCreateManualReleases` in one resolver. |
| Audio upload draft single (`app/api/chat/audio/route.ts:27` → `lib/chat/route-audio-upload.ts:118`) | Adapter keeps upload/inference; the release insert goes through the dispatcher. |
| Spotify ingestion (`lib/discography/spotify-import.ts:843`, 4 triggers) | Ingestion keeps its `spotifyId` lookup + `onConflictDoUpdate` sync semantics — it is a sync process, not a user action, and is **not** `release.create`. It shares the canonical slug/validation helpers but does not route through the per-action ledger. |

**Dispatcher absorbs:** the `releaseType` enum (one declaration), title/date
validation (replacing three divergent implementations), slug generation, the
insert-vs-upsert split, and server-side entitlement enforcement at invoke time.

**Adapters keep:** dashboard form UX, chat tool result phrasing, album-art
candidate flow, audio upload plumbing, Spotify sync scheduling and its
per-trigger rate limits.

**Parity criterion:** all four direct-create entry points route through the
dispatcher; a same-key/same-input replay returns the original release instead
of silently overwriting (today's upsert) or failing on slug conflict (today's
dashboard action); `releaseType: 'mixtape'|'other'` accepted identically on
every surface; the canonical form owner is Library/release domain code (not
the legacy `/app/dashboard/releases` route), resolved before the adapter
lands; Spotify ingestion verified unaffected by the extraction.

## `task.create` migration

Contract: `packages/action-contracts/actions/task-create.ts`. Effect:
`internal_write`; requirements include `canAccessTasksWorkspace`. Users
without access receive a truthful structured `unavailable` result with an
entitlement reason code and upgrade handoff, never a silent no-op.

| Current entry point | Migration target |
| --- | --- |
| `createTask` (`app/(shell)/dashboard/tasks/task-actions.ts:626`, core `createTaskForProfile` :249) | Becomes the executor core behind the dispatcher: single home for `taskNumber` reservation, `position` computation, assignee mapping, and schema validation (the unused `insertTaskSchema` at `lib/db/schema/tasks.ts:94` is superseded by the manifest schema). |
| `addReleaseTask` (`releases/task-actions.ts:280`) | Thin wrapper delegating to the dispatcher; the double `requireTasksWorkspaceAccess` check and its private `requireReleaseAccess` copy are deleted. |
| `instantiateReleaseTasks` (`releases/task-actions.ts:88`) | Bulk instantiation becomes repeated `task.create` invocations in one transaction (or a declared batch path); `dedupeReleaseTasks` list-layer guarantee replaced by ledger + constraint-backed idempotency. |
| `instantiateReleaseTasksFromCatalog` (`catalog-task-actions.ts:83`) | Same treatment; snapshot writes (`release_task_snapshots`) stay domain-internal. |
| `addCatalogTaskToRelease` (`catalog-task-actions.ts:320`) | Migrates onto the ledger while keeping its `UNIQUE(release_id, catalog_slug)` constraint as the domain-level backstop. |
| Chat tool `manageTasks` (`lib/chat/tools/tasks.ts:37`) | Chat adapter only: intent parsing + result phrasing. The locked-stub gate dance (`locked-tools.ts:39`) collapses into the single dispatcher entitlement check, surfaced to chat as the canonical `unavailable` result with an entitlement reason code and upgrade metadata. |

**Dispatcher absorbs:** the three copies of the release-ownership check, the
repeated entitlement gate (chat stub + server action + nested re-check), the
three task-number allocators, the four `position = max+1` computations, bulk
row-building, and the split validation (zod only at the chat boundary today).

**Adapters keep:** tasks/release UI state and optimistic updates, chat tool
intent UX, upgrade-CTA presentation (rendered from the canonical structured
error's `upgrade` metadata, not string-matched `isUpgradeRequiredError`).

**Parity criterion:** all five server actions and both chat intents route
through the dispatcher; entitlement denial produces the canonical structured
error on every surface with identical upgrade telemetry; concurrent same-key
submissions yield exactly one task (ledger replay); task numbering and
position invariants hold under the existing concurrency tests.

## Cross-client adapter targets

| Surface | Target in program sequence |
| --- | --- |
| Web sidebar (approved adapter) | Step 7 — direct `New Chat` segment plus menu items `New Release…`, `Add Contact`, `New Task`; first pure-presentation client of the dispatcher. |
| iOS / App Intents (`apps/ios/Jovie/Features/Intents/JovieAppIntents.swift`) | Step 8 — Swift binding spec in `packages/action-contracts/bindings/` becomes runtime-backed only when the app ships it with a receipt. |
| Electron (`apps/desktop`) | Step 8 — stays a shell; tray/menu actions call dispatcher-backed endpoints through the hosted web app or a thin IPC adapter; the inert standalone New Message event is removed once parity is proven. |
| Owner-workspace MCP | Step 9 — **new** authenticated server; separate from the public per-artist endpoint, which never gains writes. |
| CLI | Step 9 — **new** product CLI package (with OAuth/PKCE auth, packaging, distribution); no CLI exists today. |
| WidgetKit / net-new clients | Step 10 — adapter-first from day one; never touch legacy paths. |
| Extension, macOS MenuMonitor, console, eve-pilot | No action surfaces today; any future create capability ships as a dispatcher adapter, never as a new legacy path. |

## Old-path deletion rule (step 11)

A legacy path is deleted only when, for its action: (a) every caller has been
migrated, (b) the parity criterion above is met with production evidence
(canary + replay tests + telemetry), and (c) the deletion PR removes the dead
code, its tests, and its docs references together. Deletion is per-path, not
per-action — e.g. `/api/chat/conversations` can be deleted independently of the
onboarding chat handler once its own callers migrate. Deleted paths are
removed rather than retained as permanent fallbacks; rollback during migration
is via per-action/channel kill switches.
