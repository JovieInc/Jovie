# Canonical Actions migration map (JOV-5041)

How each existing entry point in [INVENTORY.md](./INVENTORY.md) migrates onto
the Canonical Actions platform, in the approved program sequence. The contract
layer already exists: `packages/action-contracts` (manifest, zod schemas,
canonical result envelope `{ ok, data|error, meta }`, generated JSON Schema /
OpenAPI artifacts, contract-only binding specs). Everything below it — the
dispatcher, the ledger, and each adapter migration — is follow-up work (see
[FOLLOWUPS.md](./FOLLOWUPS.md)).

## Program sequence (approved order)

1. **Foundation** — contract package + this documentation set (this ticket).
2. **Dispatcher + ledger** — durable `action_executions` table; canonical
   resolver owning entitlement/quota/flag/validation/idempotency/error
   semantics for all four actions.
3. **`chat.start` canary** — first action routed through the dispatcher, no
   user-visible change.
4. **`contact.create` real write** — first mutation written through the
   dispatcher + ledger.
5. **`task.create` + `release.create` extraction** — collapse the duplicated
   server-action/chat-tool write paths into the resolver.
6. **Approved web sidebar adapter** — the first pure-presentation client
   consuming the dispatcher.
7. **iOS / App Intents + Electron** — native surfaces become adapters.
8. **Authenticated owner-workspace MCP + CLI** — new server + new product CLI.
9. **WidgetKit / new clients** — net-new surfaces, adapter-first.
10. **Old-path deletion after parity** — legacy routes/actions removed only
    after the parity criteria below are met per action.
11. **Post-deletion cleanup/verification** — see FOLLOWUPS.md step 11.

Two hard boundaries apply to the whole map:

- **The public per-artist MCP endpoint (`apps/web/app/api/mcp/[username]/route.ts`)
  never receives authenticated workspace writes.** Every action declares
  `auth.publicArtistMcpWritable === false`. Owner-workspace MCP is a *new*,
  separately authenticated server (step 8); the existing public endpoint keeps
  its read tools and its cookie-authed merch writes untouched until that step.
- **No binding may claim runtime support before a real product surface exists.**
  CLI, WidgetKit, and Siri/App Intents bindings stay `contract-only` in the
  manifest until the actual client ships with a runtime receipt. Do not add
  `existing`-status bindings for surfaces that have no code.

## What the dispatcher absorbs vs. what adapters keep

Per the contract in `packages/action-contracts`:

- **Dispatcher absorbs (canonical, server-side, one copy):** input validation
  against the manifest zod schemas; entitlement evaluation against
  `action.entitlementKeys` via `lib/entitlements/registry.ts`; quota/rate
  limiting; feature-flag checks; idempotency via the `idempotencyKey` input
  field with `onConflict: 'replay'` semantics against the `action_executions`
  ledger; the structured error taxonomy (`COMMON_ERROR_CODES` +
  per-action `domainErrorCodes`); persistence of the domain write.
- **Adapters keep (presentation only):** transport framing (SSE/NDJSON
  streaming, JSON-RPC envelope, server-action serialization, IPC), auth-token
  acquisition and refresh, rendering, and local UX state. Adapters never
  re-implement validation, entitlement, or idempotency logic.

## `chat.start` migration

Contract: `packages/action-contracts/actions/chat-start.ts`. Domain error codes
`CHAT_DISABLED`, `TURN_IN_PROGRESS` on top of the common set. No entitlement
keys declared on the action itself; plan/quota policy is enforced centrally by
the dispatcher via the existing chat quota stack.

| Current entry point | Migration target |
| --- | --- |
| `POST /api/chat` (`apps/web/app/api/chat/route.ts:2326`) | Thin adapter: parse transport, call dispatcher, stream the canonical envelope as SSE. `executeChatTurn` (`lib/chat/run.ts:238`) becomes resolver-internal. |
| Onboarding mode of same route (`onboarding-handler.ts:188`) | Stays a separate anonymous surface in the canary phase; the canonical `chat.start` is authenticated/profile-scoped. Onboarding converge is deferred and tracked as its own decision. |
| `POST /api/chat/conversations` (`app/api/chat/conversations/route.ts:85`) | Replaced by `chat.start` with no first message (conversation shell only). Gains real idempotency it lacks today. |
| `POST /api/onboarding/welcome-chat` (`app/api/onboarding/welcome-chat/route.ts:33`) | Replaced by resolver-side conversation claim/reuse logic behind `chat.start`; the FOR UPDATE + sessionId-claim semantics move into the resolver. |
| `POST /api/mobile/v1/chat/turns` (`app/api/mobile/v1/chat/turns/route.ts:11`, handler `lib/mobile/chat/turn-handler.ts:110`) | Thin adapter: bearer auth + NDJSON framing only. `reserveChatTurn` semantics are the seed for ledger replay (`meta.replayed`). |
| Clients: `useJovieChat.ts:417`, `OnboardingChat.tsx:117`, `/start` page, `HomepageIntent.tsx:43`, `MobileChatClient.swift:64`, Electron tray `new-message` | Presentation only; each switches its transport to the adapter endpoint. No client keeps validation/normalizer logic. |

**Dispatcher absorbs:** the three divergent message validators
(`request-validation.ts:129`, `onboarding-handler.ts:805`,
`contract.ts:72` → one manifest schema), entitlement resolution
(`resolveChatAccountContext` as the single entry), `checkAiChatRateLimitForPlan`
quota, the `ai_chat_disabled` kill switch with one semantics, and
`reserveChatTurn` idempotency generalized onto `action_executions`.

**Adapters keep:** SSE vs NDJSON framing, `x-request-id`/streaming headers,
Turnstile/session-cookie mechanics on the anonymous onboarding surface,
401 token-refresh retry on iOS.

**Parity criterion (before any old path is deleted):** every production caller
routes through the dispatcher; golden-path and duplicate-replay behavior matches
the legacy `reserveChatTurn` outcomes (`reserved` / `duplicate_completed` /
`duplicate_in_progress`) verified by replay tests against the ledger; error
codes map 1:1 to the legacy surface per adapter; the cron canary
(`app/api/cron/auth-signup-onboarding-canary/route.ts:114`) and Promptfoo eval
provider run against the new path with no score regression.

## `contact.create` migration

Contract: `packages/action-contracts/actions/contact-create.ts`. Entitlement
key `contactsLimit`; domain error code `CONTACT_LIMIT_EXCEEDED`. Scope note:
the canonical action covers **creator-owned contacts/subscribers on the
authenticated profile** — the `notification_subscriptions` fan-capture and
`creator_contacts` concepts. Anonymous fingerprint tracking
(`audience_members`) is telemetry, not an action, and is out of scope for the
dispatcher.

| Current entry point | Migration target |
| --- | --- |
| `POST /api/notifications/subscribe` (`app/api/notifications/subscribe/route.ts:49`, domain `lib/notifications/domain.ts:644`) | Primary fan-capture adapter. Validation, Pro/SMS gating, suppression, and dedup move to the resolver. |
| `POST /api/notifications/verify-email-otp` (domain `lib/notifications/domain.ts:856`) | OTP confirmation stays a domain step of the resolver, not a separate action. |
| Promo OTP pair (`app/api/promo-downloads/[id]/request-otp/route.ts:34`, `verify-otp/route.ts:40`) | Funnel into the same resolver; `otp-service.ts` upserts collapse into one canonical upsert. |
| `POST /api/notifications/sms-intents` (`route.ts:76`) + Twilio webhook (`app/api/webhooks/sms/route.ts:34` → `lib/notifications/sms-webhook.ts`) | SMS intent/consume pipeline keeps webhook mechanics; contact/subscription creation goes through the resolver. Webhook dedup (`webhookEvents`) remains transport-level. |
| `saveContact` server action (`app/(shell)/dashboard/contacts/actions.ts:135`) | First canonical `contact.create` caller: `creator_contacts` write with `contactsLimit` enforced centrally instead of ad hoc. Gains the idempotency key it lacks today. |
| `processProfileExtraction` (`lib/ingestion/flows/profile-processing.ts:119`) | Ingestion writes through the resolver so the `contactsLimit` bypass is closed. |
| Anonymous tracking (`audience/visit`, `audience/click`, `/s/[code]`, `/api/track`) | **Not actions.** Stay as telemetry upserts; the 6×-duplicated `audience_members` upsert is consolidated as a shared helper, not a canonical action. |
| Platform-level (`changelog/subscribe`, `waitlist`) | Out of scope — different entity (Jovie platform, not artist audience). |
| Clients: `useNotificationStatusQuery`, `useProfileNotificationsController`, `useSubscriptionForm`, `ProfilePacCard`, `useContactsManager`, `useDebouncedContactSave` | Presentation only; client-side `sanitizeContactInput` duplication (useContactsManager.ts:288) is deleted once server validation is canonical. |

**Dispatcher absorbs:** the three divergent Pro-gating mechanisms
(`lib/entitlements` vs raw `users.isPro` joins vs env flag), contact validation
(zod vs manual `sanitizeContactInput` vs `lib/notifications/validation`),
channel/consent rules, and idempotency-key replay on top of the existing
unique-constraint upserts.

**Adapters keep:** OTP email/SMS delivery, Turnstile, honeypots, Twilio HMAC
verification, webhook claim-then-process, rate-limit headers, fan-facing copy.

**Parity criterion:** `saveContact` and `POST /api/notifications/subscribe`
both route through the dispatcher with shadow-write comparison showing zero
divergence on a production canary cohort; duplicate-submission replay returns
`meta.replayed` with the originally recorded contact; `contactsLimit` denials
emit the canonical `CONTACT_LIMIT_EXCEEDED` envelope and `logEntitlementDenial`
telemetry from exactly one code path.

## `release.create` migration

Contract: `packages/action-contracts/actions/release-create.ts`. Entitlement
key `canCreateManualReleases`; domain error code `RELEASE_SLUG_CONFLICT`; the
canonical `RELEASE_TYPES` enum is the superset of the divergent per-surface
enums.

| Current entry point | Migration target |
| --- | --- |
| `createRelease` server action (`app/(shell)/dashboard/releases/actions.ts:2235`) | Replaced by dispatcher call. Server-side `canCreateManualReleases` enforcement appears for the first time (client-only today). Slug strategy unifies on `generateUniqueSlug` + ledger replay instead of raw `slugify` + unique-violation catch. |
| `createReleaseTool` (`app/api/chat/route.ts:1559`) | Chat tool becomes a dispatcher adapter; upsert-on-conflict overwrite semantics replaced by insert-or-replay. |
| Album-art `create-release-and-apply` (`app/api/chat/album-art/create-release-and-apply/route.ts:34` → `lib/services/album-art/apply.ts:219`) | Adapter keeps artwork-apply orchestration; release row creation goes through the dispatcher. Gating reconciles `canGenerateAlbumArt`/`ALBUM_ART_GENERATION` with `canCreateManualReleases` in one resolver. |
| Audio upload draft single (`app/api/chat/audio/route.ts:27` → `lib/chat/route-audio-upload.ts:118`) | Adapter keeps upload/inference; the release insert goes through the dispatcher. |
| Spotify ingestion (`lib/discography/spotify-import.ts:843`, 4 triggers) | Ingestion keeps its `spotifyId` lookup + `onConflictDoUpdate` sync semantics — it is a sync process, not a user action. It shares the canonical slug/validation helpers but does not route through the per-action ledger. |

**Dispatcher absorbs:** the `releaseType` enum (one declaration), title/date
validation (replacing three divergent implementations), slug generation, the
insert-vs-upsert split, and server-side entitlement enforcement.

**Adapters keep:** dashboard form UX, chat tool result phrasing, album-art
candidate flow, audio upload plumbing, Spotify sync scheduling and its
per-trigger rate limits.

**Parity criterion:** all four direct-create entry points route through the
dispatcher; a same-payload replay returns the original release (`meta.replayed`)
instead of silently overwriting (today's upsert) or failing on slug conflict
(today's dashboard action); `releaseType: 'mixtape'|'other'` accepted
identically on every surface; Spotify ingestion verified unaffected by the
extraction.

## `task.create` migration

Contract: `packages/action-contracts/actions/task-create.ts`. Entitlement key
`canAccessTasksWorkspace`; domain error codes `TASKS_WORKSPACE_LOCKED`,
`RELEASE_NOT_FOUND`.

| Current entry point | Migration target |
| --- | --- |
| `createTask` (`app/(shell)/dashboard/tasks/task-actions.ts:626`, core `createTaskForProfile` :249) | Becomes the resolver core: single home for `taskNumber` reservation, `position` computation, assignee mapping, and zod validation (the unused `insertTaskSchema` at `lib/db/schema/tasks.ts:94` is superseded by the manifest schema). |
| `addReleaseTask` (`releases/task-actions.ts:280`) | Thin wrapper delegating to the resolver; the double `requireTasksWorkspaceAccess` check and its private `requireReleaseAccess` copy are deleted. |
| `instantiateReleaseTasks` (`releases/task-actions.ts:88`) | Bulk instantiation becomes a resolver batch path (or repeated `task.create` calls in one transaction); `dedupeReleaseTasks` list-layer guarantee replaced by ledger + constraint-backed idempotency. |
| `instantiateReleaseTasksFromCatalog` (`catalog-task-actions.ts:83`) | Same treatment; snapshot writes (`release_task_snapshots`) stay resolver-internal. |
| `addCatalogTaskToRelease` (`catalog-task-actions.ts:320`) | Migrates onto the ledger while keeping its `UNIQUE(release_id, catalog_slug)` constraint as the domain-level backstop. |
| Chat tool `manageTasks` (`lib/chat/tools/tasks.ts:37`) | Chat adapter only: intent parsing + result phrasing. The locked-stub gate dance (`locked-tools.ts:39`) collapses into the single dispatcher entitlement check, surfaced to chat as the canonical `ENTITLEMENT_DENIED`/`TASKS_WORKSPACE_LOCKED` envelope. |

**Dispatcher absorbs:** the three copies of the release-ownership check, the
repeated entitlement gate (chat stub + server action + nested re-check), the
three task-number allocators, the four `position = max+1` computations, bulk
row-building, and the split validation (zod only at the chat boundary today).

**Adapters keep:** tasks/release UI state and optimistic updates, chat tool
intent UX, upgrade-CTA presentation (rendered from the canonical error, not
string-matched `isUpgradeRequiredError`).

**Parity criterion:** all five server actions and both chat intents route
through the dispatcher; entitlement denial produces the canonical envelope on
every surface with identical upgrade telemetry; concurrent same-key submissions
yield exactly one task (ledger replay); task numbering and position invariants
hold under the existing concurrency tests.

## Cross-client adapter targets

| Surface | Target in program sequence |
| --- | --- |
| Web sidebar (approved adapter) | Step 6 — first pure-presentation client of the dispatcher. |
| iOS / App Intents (`apps/ios/Jovie/Features/Intents/JovieAppIntents.swift`) | Step 7 — Swift binding spec in `packages/action-contracts/bindings/` becomes `existing` only when the app ships it. |
| Electron (`apps/desktop`) | Step 7 — stays a shell; tray/menu actions call dispatcher-backed endpoints through the hosted web app or a thin IPC adapter. |
| Owner-workspace MCP | Step 8 — **new** authenticated server; separate from the public per-artist endpoint, which never gains writes. |
| CLI | Step 8 — **new** product CLI package; no CLI exists today. |
| WidgetKit / net-new clients | Step 9 — adapter-first from day one; never touch legacy paths. |
| Extension, macOS MenuMonitor, console, eve-pilot | No action surfaces today; any future create capability ships as a dispatcher adapter, never as a new legacy path. |

## Old-path deletion rule (step 10)

A legacy path is deleted only when, for its action: (a) every caller has been
migrated, (b) the parity criterion above is met with production evidence
(canary + replay tests + telemetry), and (c) the deletion PR removes the dead
code, its tests, and its docs references together. Deletion is per-path, not
per-action — e.g. `/api/chat/conversations` can be deleted independently of the
onboarding chat handler once its own callers migrate.
