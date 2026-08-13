# Canonical Actions source inventory (JOV-5041)

Complete, verified inventory of every existing entry point for the four stable
Canonical Actions IDs plus the cross-client surfaces that will later host them.
Every `file:line` reference below was verified by reading the source (5-agent
inventory swarm, branch `symphony/JOV-5041-fix`). Nothing here is invented; if a
surface is listed as "none", it was grep/read-verified as absent.

Contract package: [`packages/action-contracts`](../../../packages/action-contracts/README.md)
owns action identity (manifest, schemas, envelope, bindings). The dispatcher and
durable `action_executions` ledger do not exist yet — see
[MIGRATION_MAP.md](./MIGRATION_MAP.md) for where each entry point migrates.

Action IDs:

| ID | Purpose | Contract |
| --- | --- | --- |
| `chat.start` | Create/resume an authenticated AI chat conversation | `actions/chat-start.ts` |
| `contact.create` | Create an audience contact (email/SMS subscriber) | `actions/contact-create.ts` |
| `release.create` | Create a discography release | `actions/release-create.ts` |
| `task.create` | Create a workspace task | `actions/task-create.ts` |

---

## 1. `chat.start` — starting an AI chat session

### 1a. `POST /api/chat` — authenticated artist chat turn (primary)

- **Path:** `apps/web/app/api/chat/route.ts:2326` (`POST`); dispatch pipeline `apps/web/lib/chat/run.ts:238` (`executeChatTurn`)
- **What:** Runs one AI chat turn; lazily creates conversation + turn via `reserveChatTurn` when `clientTurnId` present. Streams UIMessage SSE.
- **Validation:** `parseChatRequestBody` / `validateMessagesArray` in `apps/web/lib/chat/request-validation.ts:168,129` — manual checks (body ≤256KB, ≤50 messages, ≤4000 chars/user msg, parts caps); `artistContextSchema` zod (`lib/chat/types.ts`) only for legacy client-provided context; per-field normalizers (`normalizeClientId` route.ts:490, `normalizeChatTurnSource` :468, `normalizePinnedOpportunity` :497).
- **Entitlement/flags:** `resolveChatAccountContext` (`lib/chat/account-context.ts:132`) → `getEntitlements` (`lib/entitlements/registry`); `canUsePaidChatTools` + `resolveChatTurnPlanLimits` (`lib/chat/tool-access.ts:3,13`); Statsig kill switches `ai_chat_disabled` / `ai_chat_force_light` via `checkGatesForUser` (route.ts:2382); `getAppFlagValue('ALBUM_ART_GENERATION'|'TELEPROMPTER_RECORDING')`; `canUseOvChatMode` for `chatMode:'ov'`; quota `checkAiChatRateLimitForPlan` (`lib/rate-limit/limiters.ts:628`).
- **Idempotency:** `reserveChatTurn` (`lib/chat/turns.ts:222`) — unique insert on `(creatorProfileId, userId, clientTurnId)` with `onConflictDoNothing` → `reserved` / `duplicate_completed` (replay stream) / `duplicate_in_progress` (409); messages deduped via partial unique index `idx_chat_messages_conversation_client_message_unique`.
- **Errors:** JSON `{ error, message?, errorCode?, retryAfter?, requestId }` + `x-request-id` header. Codes: 400, 401, 403 (OV non-admin), 404 (profile), 409 (`TURN_IN_PROGRESS`), 429 (`RATE_LIMITED` + rate-limit headers), 499 (client disconnect), 500 (`buildChatErrorResponse` route.ts:2193), 503 (`CHAT_DISABLED`). Reserved-turn failures return 200 streams with `x-chat-terminal-failure` / `x-chat-preflight` headers instead.
- **Adapter:** web route; consumed by `useJovieChat` (3a below).

### 1b. `POST /api/chat` with `mode:'onboarding'` — anonymous onboarding chat

- **Path:** `apps/web/app/api/chat/onboarding-handler.ts:188` (`tryHandleAnonymousOnboardingChat`, dispatched from route.ts:2348)
- **What:** Unauthenticated onboarding conversation (`/start`); mints signed session cookie, runs Turnstile, IP/ASN/session rate limits, then `executeChatTurn` with onboarding tools; deterministic scripted fallback (`lib/chat/onboarding-script/engine.ts`) on kill-switch/LLM failure.
- **Validation:** zod envelope `onboardingPayloadSchema` (onboarding-handler.ts:83) + separate manual `validateOnboardingMessages` (:805) — deliberately does *not* reuse `validateMessagesArray`.
- **Entitlement/flags:** `checkGateForUser(null, 'ai_chat_disabled')`; `isWaitlistGateEnabled` (`lib/waitlist/settings`); fixed `getEntitlements('free')`; Turnstile `verifyTurnstileToken` (fail-closed); `checkAnonymousChatRateLimit` (`lib/rate-limit/limiters.ts:473`).
- **Idempotency:** conversation reused by `sessionId` lookup; messages deduped via `(conversationId, clientMessageId)` conflict-nothing (:694, :762).
- **Errors:** JSON `{ error, errorCode, requestId }`: 400 `INVALID_ONBOARDING_PAYLOAD`/`INVALID_MESSAGES`, 403 `TURNSTILE_REQUIRED`, 429 `RATE_LIMITED`, 503 `SESSION_SECRET_NOT_CONFIGURED`/`TURNSTILE_NOT_CONFIGURED`/`ONBOARDING_CHAT_PERSISTENCE_FAILED`, 500 `INTERNAL_ERROR`, 499 disconnect.
- **Adapter:** web route (same URL as 1a), consumed by `OnboardingChat` (3b).

### 1c. `POST /api/chat/conversations` — create empty conversation

- **Path:** `apps/web/app/api/chat/conversations/route.ts:85`
- **What:** Creates a conversation row (+ optional initial user message) without running the LLM.
- **Validation:** manual only — `sanitizeConversationTitle`, initialMessage ≤4000 chars; no zod.
- **Entitlement/flags:** none — only auth via `getSessionContext({requireProfile:true})` and a hard cap of 200 conversations/user (403).
- **Idempotency:** none — every POST inserts a new row.
- **Errors:** `{ error }` JSON; 400/401/403/404/500 via `getSessionErrorResponse` (`app/api/chat/session-error-response.ts:26`); 201 success.
- **Adapter:** web route.

### 1d. `POST /api/onboarding/welcome-chat` — post-signup welcome conversation

- **Path:** `apps/web/app/api/onboarding/welcome-chat/route.ts:33`
- **What:** Bootstraps the first authenticated conversation: reuses latest conversation, claims the anonymous onboarding conversation (by `sessionId`), or creates one with a generated welcome message; seeds presence-build queue behind flag.
- **Validation:** manual — `initialReply` ≤2000 chars.
- **Entitlement/flags:** `getAppFlagValue('ONBOARDING_WOW_TASK_QUEUE')` only; no plan/quota check.
- **Idempotency:** `SELECT ... FOR UPDATE` profile row lock inside `withDbSessionTx` + reuse/claim semantics; last-message equality check before appending `initialReply`. No idempotency key.
- **Errors:** `{ success:boolean, error? }`; 400/404/500; 200 reused / 201 created.
- **Adapter:** web route, called from `apps/web/app/app/(shell)/chat/ChatPageClient.tsx:694`.

### 1e. `POST /api/mobile/v1/chat/turns` — native mobile chat turn

- **Path:** route `apps/web/app/api/mobile/v1/chat/turns/route.ts:11`; handler `apps/web/lib/mobile/chat/turn-handler.ts:110`
- **What:** iOS chat turn; reserves turn (creating conversation if needed), runs `executeChatTurn`, streams NDJSON (`turn.reserved`/`assistant.delta`/`assistant.completed`/`web.handoff`/`error`).
- **Validation:** manual `parseMobileChatTurnRequest` (`lib/mobile/chat/contract.ts:72`) — requires `clientTurnId`/`clientMessageId`/text ≤4000, `source:'typed'`. Not zod.
- **Entitlement/flags:** bearer session via `getMobileSessionUserId` + `requireMobileProfileSession`; `resolveChatAccountContext`; `checkAiChatRateLimitForPlan` (turn-handler.ts:187); merch tools gated inline on `accountContext.planLimits.booleans.canAccessMerchCreation` (:314).
- **Idempotency:** same `reserveChatTurn` (turn-handler.ts:130) — duplicates replay as `assistant.completed` or `web.handoff`.
- **Errors:** **different shape** — single-line NDJSON `{type:'error', errorCode, message}` with HTTP 400/401/404(`MOBILE_CHAT_PROFILE_REQUIRED`)/409(`TURN_IN_PROGRESS`); rate-limit and context failures return **200 NDJSON** `assistant.completed` with the failure text.
- **Adapter:** web route serving iOS.

### 1f. Adjacent (not session-starters, listed for completeness)

- `POST /api/chat/conversations/[id]/messages` (`.../messages/route.ts:99`) — legacy message append; zod `chatPersistenceBatchSchema`/`chatPersistenceMessageSchema` (`lib/chat/tool-events.ts`); conflict-nothing on `clientMessageId`; no quota.
- `POST /api/chat/audio` (`audio/route.ts:27`) — audio upload routing (zod `chatAudioSchema`); not a chat session (but see `release.create` — it creates a draft single).
- `GET /api/chat/usage`, `GET /api/chat/capabilities`, `POST /api/chat/feedback`, `POST /api/chat/confirm-*`, `POST /api/chat/album-art/*`, `POST /api/chat/files/upload-token` — tool-action/auxiliary, no session creation.
- Internal probes: cron canary `apps/web/app/api/cron/auth-signup-onboarding-canary/route.ts:114` (POSTs onboarding-mode `/api/chat`); eval harness `apps/web/tests/eval/promptfoo/jovie-chat-provider.ts` (calls `executeChatTurn` + route paths directly).

### Chat tools invoked by the LLM (not session starters)

Canonical registry: `CHAT_ROUTE_TOOL_IDS` in `apps/web/lib/chat/chat-tool-inventory.ts:25` — 35 tool IDs, fail-closed via `assertChatToolsRegistered` (route.ts:2858). Built per-surface: `buildFreeChatTools` / `buildChatTools` (closures inside route.ts), `createAccountChatTools` (`lib/chat/account-tools.ts`), `buildOnboardingTools` (`lib/chat/tools/onboarding-tool-impls.ts`), mobile merch subset (turn-handler.ts:313), plan-locked stubs (`lib/chat/locked-tools.ts`). Extra tool impls under `apps/web/lib/chat/tools/*` and `apps/web/lib/ai/tools/*`. None of these *start* chats; they run inside a turn.

### Client entry points

- **In-app web chat:** `apps/web/components/jovie/hooks/useJovieChat.ts:417` — `DefaultChatTransport({api:'/api/chat'})` with `profileId`/`conversationId`/`clientTurnId`; adopts server IDs from `x-conversation-id`/`x-chat-turn-id` headers.
- **Anonymous onboarding client:** `apps/web/components/features/onboarding/OnboardingChat.tsx:117` — `OnboardingChatTransport` posts `mode:'onboarding'` + Turnstile token to `/api/chat`.
- **`/start` page:** `apps/web/app/(dynamic)/start/page.tsx:32` — canonical public chat entry; resolves `intent_id` handoff (`lib/onboarding/start-entry-handoff.ts`), redirects authed users.
- **Marketing homepage intent capture:** `apps/web/components/homepage/HomepageIntent.tsx:43` — builds `/start?intent_id=…` (localStorage intent store, no direct API call).
- **iOS:** `apps/ios/Jovie/Core/MobileChatClient.swift:64` (`sendTurn` → `POST /api/mobile/v1/chat/turns`, Bearer token, NDJSON parse, 401 token-refresh retry); invoked from `apps/ios/Jovie/Core/ChatRepository.swift:147` (`clientTurnId`/`clientMessageId` UUIDs generated at :117-118). List/detail via `/api/mobile/v1/chat/conversations` (GET only).
- **Desktop (Electron):** no chat API — tray `open-chat` action only (`apps/desktop/src/tray.ts:17,193`) opens the web app; `handleTrayAction('new-message')` (`main.ts:1654`) sends a `tray-action` event to the renderer (`preload.ts:179`), which the hosted web app turns into a chat message.
- **Extension:** no chat session — only a `chatPromptEnabled` flag gate with placeholder copy (`apps/extension/src/sidepanel.ts:808-834`); API calls limited to `/api/extension/flags|summary|action-log`.
- **macOS (`apps/macos/MenuMonitor`), console, should-i-make, eve-pilot:** no chat entry points (grep-verified, zero matches).
- **MCP server:** `apps/web/app/api/mcp/[username]/route.ts` — public read-only artist tools; **no chat/conversation start**.
- **CLI:** none — no `bin/`/`cli/` product CLI exists.

### Duplicated logic across surfaces (centralization targets)

- **Message validation ×3:** `validateMessagesArray` (request-validation.ts:129) vs `validateOnboardingMessages` (onboarding-handler.ts:805, explicitly forked) vs `parseMobileChatTurnRequest` (contract.ts:72). Different caps, different error strings.
- **Entitlement resolution:** `resolveChatAccountContext` shared by web + mobile, but onboarding hardcodes `getEntitlements('free')`; paid-tool gating via `canUsePaidChatTools` (web) vs inline `planLimits.booleans.canAccessMerchCreation` (mobile) — merch tool set duplicated between `buildChatTools` and turn-handler.ts:313-335.
- **Rate-limit messaging:** `checkAiChatRateLimitForPlan` + the `billingVerification==='unavailable'` copy duplicated verbatim in route.ts:2695-2701 and turn-handler.ts:187-197.
- **Kill switch:** `ai_chat_disabled` checked twice with different semantics (503 in route.ts:2386; scripted-fallback in onboarding-handler.ts:503).
- **Error contracts ×3:** JSON `{error,errorCode,requestId}` (web), NDJSON `{type:'error',errorCode,message}` (mobile), `{success:false,error}` (welcome-chat). Rate-limit is 429 JSON on web but 200 NDJSON on mobile.
- **Conversation creation ×4:** `reserveChatTurn` (turns.ts:264), conversations POST (route.ts:136, no idempotency), welcome-chat (FOR UPDATE reuse), onboarding-handler (sessionId lookup) — four distinct create/reuse paths.

### Summary count

| Surface | Chat-start entry points |
| --- | --- |
| Web API (prod) | 5: `/api/chat` POST (auth), `/api/chat` onboarding mode, `/api/chat/conversations` POST, `/api/onboarding/welcome-chat` POST, `/api/mobile/v1/chat/turns` POST |
| Web API (internal/test) | 2: cron canary probe, Promptfoo eval provider |
| Web clients | 4: `useJovieChat`, `OnboardingChat`, `/start` page, `HomepageIntent` (redirect-only) |
| iOS | 1 client (`MobileChatClient.sendTurn`) → mobile turns route |
| macOS / desktop / extension / MCP / CLI | 0 (desktop tray deep-links to web; extension has flag stub only) |

**Total: 5 production server entry points, 2 internal, 5 client initiators.** All four creation paths converge on the `chatConversations`/`chatMessages`/`chatTurns` tables, but only the `clientTurnId` path (`reserveChatTurn`) has true idempotency.

---

## 2. `contact.create` — creating a contact / audience member / subscriber

Four distinct backing tables are in play: `audience_members` (fingerprinted visitors/fans), `notification_subscriptions` (email/SMS fans), `tip_audience` (tippers), `creator_contacts` (creator's own business contacts — a different "contact" concept). Plus platform-level `product_update_subscribers` and `waitlist_entries`, and the SMS pipeline's `notification_contacts` / `sms_subscribe_intents`.

### A. Public fan capture — `notification_subscriptions` (+ `audience_members`)

**1. `POST /api/notifications/subscribe`** — `apps/web/app/api/notifications/subscribe/route.ts:49`

- **What:** Primary fan-capture endpoint (email + SMS subscribe, OTP flow for new emails).
- **Validation:** zod `subscribeSchema` (`apps/web/lib/validation/schemas/notifications.ts:93`), then manual normalize + channel checks in domain (`validateContactForChannel`, `normalizeSubscriptionEmail`/`Phone` from `lib/notifications/validation`), suppression check `isEmailSuppressed` (`lib/notifications/suppression`).
- **Entitlement:** manual Pro gate in `apps/web/lib/notifications/domain.ts:694` (`creatorIsPro` from `users.isPro` join in `fetchArtistProfile`) — SMS channel Pro-only; US/CA-only SMS guard at :710. Not via `lib/entitlements`.
- **Idempotency:** `onConflictDoUpdate` on `(creatorProfileId, email|phone)` (`domain.ts:782-801`); email dedup via `dedupKey` `notification_subscribe:{artist}:{email}` (:347); server-side OTP resend cooldown limiter (`route.ts:37-43`).
- **Errors:** `{ success, error?, ... }` + status via `buildSubscribeValidationError`/`buildSubscribeNotFoundError`/`buildSubscribeServerError` (`lib/notifications/response`), wrapped by `createNotificationJsonResponse` (`apps/web/app/api/notifications/route-helpers.ts:18`) with rate-limit headers; 400/404/429/500.
- **Adapter:** web route; domain logic in `lib/notifications/domain.ts` (`subscribeToNotificationsDomain`, :644).

**2. `POST /api/notifications/verify-email-otp`** — domain `verifyEmailOtpDomain`, `apps/web/lib/notifications/domain.ts:856`

- **What:** Confirms pending email subscription; best-effort `audience_members` upsert for Pro creators post-confirmation (:926-937).
- **Validation:** zod `verifyEmailOtpSchema` + OTP hash/expiry/attempt-count checks (max 5).
- **Entitlement:** `dynamicEnabled = creatorIsPro` decides the audience upsert.
- **Idempotency:** one-shot OTP hash cleared on success; audience upsert `ON CONFLICT (creator_profile_id, fingerprint)`.
- **Errors:** `{ success: false, error }` 400; success `{ success: true, message }` 200.
- **Adapter:** web route → same domain module.

**3. `POST /api/promo-downloads/[id]/request-otp`** — `apps/web/app/api/promo-downloads/[id]/request-otp/route.ts:34`

- **What:** Fan email → creates/upserts `notification_subscriptions` row (channel email, source `promo_download`) via `requestEmailOtp` (`apps/web/lib/notifications/otp-service.ts:136-152`).
- **Validation:** zod `requestOtpSchema` (`z.string().email()`) + honeypot field (:28-32).
- **Entitlement:** manual `users.isPro` join + `isActive` check (:80); 404 if not Pro.
- **Idempotency:** `onConflictDoUpdate` on `(creatorProfileId, email)` in otp-service; email dedupKey `promo_otp:{artist}:{email}` (`route.ts:113`).
- **Errors:** `{ error }` 400/404/500 or `{ success: true }`.
- **Adapter:** web route; shared service `lib/notifications/otp-service.ts`.

**4. `POST /api/promo-downloads/[id]/verify-otp`** — `apps/web/app/api/promo-downloads/[id]/verify-otp/route.ts:40`

- **What:** Verifies OTP, confirms subscription, fire-and-forget `audience_members` upsert via `upsertPromoAudienceMember` (`otp-service.ts:279-304`, type `email`, tag `promo`).
- **Validation:** zod `verifySchema` (:35-38); OTP logic in `verifyEmailOtp` (otp-service).
- **Entitlement:** `isPro` + `isActive` check (:79).
- **Idempotency:** `onConflictDoUpdate` on `(creator_profile_id, fingerprint)`; thank-you email dedupKey `promo_thanks:{release}:{email}` (:170).
- **Errors:** `{ error }` 400/404/500; success returns `{ success: true, files }`.
- **Adapter:** web route.

**5. `POST /api/notifications/sms-intents`** — `apps/web/app/api/notifications/sms-intents/route.ts:76`

- **What:** Starts native-SMS "text JOIN" flow — creates `sms_subscribe_intents` row via `createIntent` (`apps/web/lib/notifications/sms-intents.ts:154`).
- **Validation:** zod `smsIntentCreateSchema` (`apps/web/lib/validation/schemas/notifications.ts:155`).
- **Entitlement/flags:** env feature flag `env.NATIVE_SMS_ENABLED` (`route.ts:79-88`) → 503 `sms_disabled` when off; three custom rate limiters (per-IP, per-artist, per-visitor, :35-57).
- **Idempotency:** random intent code + `codeHash`; TTL expiry; atomic consume via status-flip UPDATE (`sms-intents.ts` `consumeIntentByCode`). No idempotency key.
- **Errors:** `{ success: false, error, code? }` 400/429/503.
- **Adapter:** web route.

**6. `POST /api/webhooks/sms`** (Twilio inbound) — `apps/web/app/api/webhooks/sms/route.ts:34` → `handleVerifiedInbound` in `apps/web/lib/notifications/sms-webhook.ts`

- **What:** Inbound `JOIN <code>` consumes intent and creates **both** `notification_contacts` (`sms-webhook.ts:338-361`, upsert on partial unique `phone_hash`) and `notification_subscriptions` (:368-400, upsert on `(creatorProfileId, phone)`, consent stamped COALESCE-first-write). STOP/HELP etc. handled regardless of flags (TCPA).
- **Validation:** Twilio HMAC signature verify (`verifyInboundSmsWebhook`); phone normalization `hashPhoneE164`.
- **Entitlement:** none on creator side at this layer (Pro gating assumed upstream).
- **Idempotency:** `webhookEvents` row inserted `ON CONFLICT DO NOTHING` on `(provider, eventId)` (:176-188), duplicate returns `200 { ok: true, idempotent: true }`; claim-then-process pattern; intent flip + contact/subscription upserts in one transaction (:305-310).
- **Errors:** 401 invalid sig, 400 malformed, 200 dup, 500 DB-down (per route header comment).
- **Adapter:** Twilio webhook route.

### B. Anonymous audience tracking — `audience_members`

**7. `POST /api/audience/visit`** — `apps/web/app/api/audience/visit/route.ts:309`

- **What:** Creates/updates anonymous `audience_members` row keyed on fingerprint (insert at :624-654).
- **Validation:** zod `visitSchema` (`apps/web/lib/validation/schemas/audience.ts:71`); bot detection `detectBot`; block check `isVisitorBlocked` (`lib/audience/block-check`).
- **Entitlement:** none (public); profile must exist + `isPublic`; self-exclusion `shouldExcludeSelfByProfileId`.
- **Idempotency:** `onConflictDoNothing` on `(creatorProfileId, fingerprint)` with raced-row fallback re-read (:648-738); schema-compat retry wrapper for missing columns.
- **Errors:** `{ error }` 400/401/403/404/429/500; success `{ success: true, fingerprint }`.
- **Adapter:** web route (called from profile page tracking beacons).

**8. `POST /api/audience/click`** — `apps/web/app/api/audience/click/route.ts` (insert at :258-283)

- **What:** Same anonymous `audience_members` upsert on click events, then records `click_events`.
- **Validation:** zod click schema + bot detection; profile public check.
- **Idempotency:** `onConflictDoNothing` on `(creatorProfileId, fingerprint)` + fallback select (:297-300).
- **Errors:** `{ error }` shape, same status taxonomy as visit.
- **Adapter:** web route.

**9. `GET /s/[code]`** (short-link redirect) — `apps/web/app/s/[code]/route.ts:98`

- **What:** Creates/updates anonymous `audience_members` during redirect; also `audience_source_links`.
- **Validation:** manual (code lookup, bot detection); no zod on this path.
- **Idempotency:** `onConflictDoNothing` on `(creatorProfileId, fingerprint)` + fallback select (:118-144).
- **Errors:** redirects, not JSON.
- **Adapter:** web route (redirect handler).

**10. `POST /api/track`** — `apps/web/app/api/track/route.ts:138` (`upsertAudienceMember`)

- **What:** Creates anonymous `audience_members` on listen/tip/social link tracking (insert :157-183).
- **Validation:** route-level checks + consent cookie parsing; bot tagging.
- **Idempotency:** `onConflictDoNothing` on `(creatorProfileId, fingerprint)` + fallback select (:180-198).
- **Errors:** `{ error }` JSON; `NO_STORE_HEADERS`.
- **Adapter:** web route.

### C. Tip-derived audience — `tip_audience`

**11. `POST /api/webhooks/stripe-tips`** → `processTipCompleted` — `apps/web/app/api/webhooks/stripe-tips/route.ts:209` → `apps/web/lib/services/tips/process-tip-completed.ts:58`

- **What:** On completed tip checkout, upserts `tip_audience` row keyed `(profileId, email)` with running totals (`process-tip-completed.ts:79-107`); sends thank-you email.
- **Validation:** Stripe webhook signature (route-level); email from `session.customer_details`.
- **Entitlement:** none at this layer.
- **Idempotency:** `tips` row `onConflictDoNothing` on `paymentIntentId` — `processTipCompleted` only runs for first-seen tips (`route.ts:185-194`); `tip_audience` upsert `onConflictDoUpdate` on `(profileId, email)` increments totals.
- **Errors:** collected in `result.errors[]`, never thrown; webhook swallows failures to avoid Stripe retries.
- **Adapter:** Stripe webhook (triggered by `POST /api/tips/create-checkout`, `apps/web/app/api/tips/create-checkout/route.ts:22`, zod `createCheckoutSchema`).

**12. `POST`/`GET /api/audience/opt-in`** — `apps/web/app/api/audience/opt-in/route.ts:116,172`

- **What:** Updates `tip_audience.marketing_opt_in` via HMAC-signed token; on first opt-in records `subscription_created` audience event if an `audience_members` row exists (:82-108). Not row creation, but mutates subscriber state.
- **Validation:** zod `optInBodySchema` + `verifyOptInToken` (`lib/email/opt-in-token`).
- **Idempotency:** keyed lookup `(profileId, email)`; event write guarded by `!existing.marketingOptIn`.
- **Errors:** POST `{ error }` 400/403/404/429/500; GET returns standalone HTML pages.
- **Adapter:** web route (email CTA + in-app toggle).

### D. Creator's own business contacts — `creator_contacts`

**13. Server action `saveContact`** — `apps/web/app/app/(shell)/dashboard/contacts/actions.ts:135`

- **What:** Insert/update `creator_contacts` (manager/agent/label etc. shown on public `/[username]/contact`).
- **Validation:** `sanitizeContactInput` (`apps/web/lib/contacts/validation.ts:67`) — manual (not zod): custom email regex + length cap, E.164-ish phone normalization, territory normalization, field clipping.
- **Entitlement:** **only surface using the entitlements module** — `getCurrentUserEntitlements()` from `apps/web/lib/entitlements/server.ts:159`, `contactsLimit` from `apps/web/lib/entitlements/registry.ts:72` (100 / 250 / null-unlimited per plan); `ContactLimitError` on exceed; billing-unavailable → allow (fail-open, :197-200).
- **Idempotency:** none (no unique constraint, no idempotency key — re-submit creates duplicates).
- **Errors:** thrown exceptions (`Unauthorized`, `ContactLimitError`, `TypeError('Contact not found')`) — server-action error propagation, not HTTP JSON.
- **Adapter:** server action. Callers: `useContactsManager.handleSave` (`apps/web/components/features/dashboard/hooks/useContactsManager.ts:289`, also re-validates with the same `sanitizeContactInput` client-side at :288 — duplicated validation) used by `ContactsManager` (`app/(shell)/contacts/ContactsPageClient.tsx:33`) and `SettingsContactsSection` (`apps/web/components/features/dashboard/organisms/SettingsContactsSection.tsx:14`); plus admin `useDebouncedContactSave` (`apps/web/components/features/admin/admin-creator-profiles/useDebouncedContactSave.ts:61`).

**14. `processProfileExtraction`** — `apps/web/lib/ingestion/flows/profile-processing.ts:119`

- **What:** Auto-creates a `creator_contacts` row (`role: 'fan_general'`) from extracted profile data during ingestion (insert at :203-207); updates existing first contact if present (:187-200).
- **Validation:** none on the contact payload itself.
- **Entitlement:** none — no `contactsLimit` check (bypasses the entitlement in `saveContact`).
- **Idempotency:** first-contact lookup (:181-187), not a unique constraint.
- **Adapter:** ingestion flow (server lib).

Read-only siblings (not creation): `GET /api/dashboard/contacts` (`apps/web/app/api/dashboard/contacts/route.ts:34`), `GET/DELETE /api/dashboard/audience/members`, `GET /api/dashboard/audience/subscribers`, `/api/notifications/update-name|update-birthday` via shared `handleSubscriberFieldUpdate` (`apps/web/app/api/notifications/update-subscriber-field.ts:30` — update-only, 5-min window), `/api/notifications/confirm` (token confirm, update-only), `/api/audience/unsubscribe`.

### E. Platform-level subscribers (adjacent, different entity)

**15. `POST /api/changelog/subscribe`** — `apps/web/app/api/changelog/subscribe/route.ts:220`

- **What:** Creates `product_update_subscribers` row (Jovie product updates, not artist audience).
- **Validation:** zod body + Turnstile bot check (`verifyTurnstile`); existing-subscriber check (:207-215).
- **Idempotency:** select-then-insert on email (race-prone; verification token `crypto.randomUUID`).
- **Errors:** `{ error }` 400/403/502/503; success `{ message }` 201.
- **Adapter:** web route.

**16. `POST /api/waitlist`** — `apps/web/app/api/waitlist/route.ts:139` → `submitWaitlistAccessRequest` (`apps/web/lib/waitlist/access-request.ts:429`, insert :476 with `onConflictDoNothing` :483)

- **What:** Creates `waitlist_entries` for authenticated users. Auth-required, onboarding rate limit, zod `waitlistRequestSchema`. Errors `{ success: false, error, code }` 400/401/403/429/500/503.
- **Adapter:** web route.

### F. Client surfaces that POST to the subscribe endpoint

All go through `subscribeToNotifications` in `apps/web/lib/notifications/client.ts:129` → `/api/notifications/subscribe`:

- `apps/web/lib/queries/useNotificationStatusQuery.ts:81` (mutation hook)
- `apps/web/components/organisms/hooks/useProfileNotificationsController.ts:9`
- `apps/web/components/features/profile/artist-notifications-cta/useSubscriptionForm.ts:17` (fan-capture form on public profile)
- `apps/web/components/features/profile/pac/ProfilePacCard.tsx:466`

### G. Surfaces checked with NO contact creation

- **MCP** `apps/web/app/api/mcp/[username]/route.ts` — tools are read-only-ish (`get_ticket_link`, `check_merch_availability`, merch propose); no contact/subscribe tool.
- **iOS** `apps/ios/` — only reads audience highlights (`AudienceHighlightsRepository`, GET); no subscribe/contact POST.
- **macOS, desktop (Electron), extension, console, eve-pilot** — no matches for contact/subscriber/audience creation.
- **CSV/import/bulk** — none found. No papaparse/csv parsing for contacts anywhere in app code; the only CSV parser is `apps/web/scripts/admin/import-events.ts` (events, not contacts). Bulk contact creation does not exist today.

### Duplicated / divergent logic worth centralizing

1. **`audience_members` upsert written 6 separate times**, all keyed `(creator_profile_id, fingerprint)` but with different column sets: `lib/notifications/domain.ts:184` (raw SQL `upsertAudienceMember`), `lib/notifications/otp-service.ts:279` (`upsertPromoAudienceMember`), `app/api/track/route.ts:138`, `app/s/[code]/route.ts:94`, `app/api/audience/visit/route.ts:624`, `app/api/audience/click/route.ts:258`. Intent-level/engagement/bot-tag merging logic (`deriveIntentLevel`, `mergeAudienceTags`) is re-derived per site.
2. **Pro gating done three different ways**: `lib/entitlements` (`getCurrentUserEntitlements().contactsLimit`) for `creator_contacts`; raw `users.isPro` joins in `domain.ts:309-315`, promo routes, and `sms-access-request/route.ts:44`; env flag for SMS intents. No single `canCreateContact`-style check.
3. **Contact validation diverges by surface**: zod schemas (`subscribeSchema`, `requestOtpSchema`, `z.string().email()`) vs manual `sanitizeContactInput` (different email regex + phone rules in `lib/contacts/validation.ts` vs `lib/notifications/validation.ts`) — and `sanitizeContactInput` runs twice (client `useContactsManager.ts:288` + server action `actions.ts:144`).
4. **Error contracts are inconsistent**: notification routes return `{ success: false, error, code }` via `route-helpers.ts`; audience/tip/promo routes return bare `{ error }`; `saveContact` throws exceptions; tip webhook collects `errors[]`.
5. **Idempotency is unique-constraint-only everywhere**; no idempotency-key header support on any creation route. `saveContact` and `changelog/subscribe` (select-then-insert) are duplicate-prone.

### Summary counts

| Surface | Creation entry points |
| --- | --- |
| Web API routes (public fan/subscriber/audience) | 12 (#1–12; counting opt-in POST+GET as one) |
| Server actions | 1 (`saveContact`) |
| Ingestion/server lib | 1 (`processProfileExtraction`) |
| Platform-level (changelog, waitlist) | 2 |
| Webhook-driven (Stripe tips, Twilio SMS) | 2 (shared with routes above) |
| Client form/hook surfaces calling subscribe | 4 (all funnel to `POST /api/notifications/subscribe`) |
| MCP / iOS / macOS / desktop / extension / console | 0 |
| CSV / bulk import | 0 (does not exist) |

Backing-table coverage: `audience_members` (6 writers), `notification_subscriptions` (3 writers: domain, otp-service, sms-webhook), `notification_contacts` (1), `sms_subscribe_intents` (1), `tip_audience` (1), `creator_contacts` (2).

---

## 3. `release.create` — creating a discography release

Production writes to `discogReleases` exist in exactly three modules: `apps/web/lib/discography/queries.ts` (`upsertRelease`), `apps/web/lib/services/album-art/apply.ts`, and `apps/web/app/app/(shell)/dashboard/releases/actions.ts` (`createRelease`). Everything else funnels into one of these.

### Dashboard server action (direct create)

**`apps/web/app/app/(shell)/dashboard/releases/actions.ts:2235` — `createRelease(formData)`**

- **What:** Manual release create from the dashboard "Add release" sidebar; inserts into `discogReleases` with `sourceType: 'manual'`.
- **Validation:** manual only — `title.trim()` non-empty check (2252), `slugify(title)` non-empty (2257), `new Date(releaseDate)` with no validity check (2265), `determineReleaseStatus`/`computeRevealDate` helpers (2221–2233). No zod. TS-only type for `releaseType` (`'single'|'ep'|'album'|'compilation'|'live'` — narrower than other surfaces).
- **Entitlement/quota:** **none server-side.** `canCreateManualReleases` (defined `apps/web/lib/entitlements/registry.ts:32`, true on all plans) is enforced only in the client: `ReleaseProviderMatrix.tsx:469-471`, `ShellReleasesView.tsx:218-267`, `NewReleaseHeaderAction.tsx:46`. Auth is implicit via `requireProfile()` → `getDashboardDataEssential()` (189–211), which redirects to `/start`.
- **Idempotency:** **no idempotency key.** Slug from plain `slugify()` (not `generateUniqueSlug`); relies on catching unique violation `isUniqueViolation(error)` (2327) → "slug already exists" message. Race-prone vs. the chat path.
- **Errors:** server-action return `{ success: false, message: string }` (never HTTP codes); errors also go to `captureError('createRelease failed', …)`.
- **Adapter:** web dashboard server action, called by `AddReleaseSidebar.tsx:145` (`apps/web/components/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar.tsx:20`).

### Chat tool

**`apps/web/app/api/chat/route.ts:1559` — `createReleaseTool(resolvedProfileId)`** (registered at 2048, gated only on `resolvedProfileId` existing)

- **What:** AI tool that creates a release directly via `upsertRelease` (1612), `sourceType: 'manual'`.
- **Validation:** zod via `chatToolSchema` (1560–1586): `title min(1).max(200)`, `releaseType` enum incl. `'mixtape'|'other'` (wider than dashboard action), `releaseDate` regex `YYYY-MM-DD` + manual `Date` validity check (1598), `label max(200)`, `upc max(20)`.
- **Entitlement:** **none** — no `canCreateManualReleases`, no quota. Registered for any resolved profile.
- **Idempotency:** `generateUniqueSlug(profileId, title, 'release')` (1606, `apps/web/lib/discography/slug.ts:199`) + `upsertRelease` `onConflictDoUpdate` on `(creatorProfileId, slug)` — **upsert, not insert**, so a same-title re-run silently overwrites.
- **Errors:** tool result `{ success: false, error: message }` (1637); success `{ success: true, release: {...} }`.
- **Adapter:** chat (web `/api/chat`; also reachable from iOS/macOS chat since mobile chat hits the same backend).

### Album-art flow (two parts)

- `apps/web/app/api/chat/route.ts:1000` — `generateAlbumArt` tool `createRelease: boolean` flag (1000–1064): when true with a title, the tool emits `state: 'needs_release_target'`; actual creation is deferred to the REST route below. Entitlement: `params.canGenerateAlbumArt` → `PLAN_UNAVAILABLE` error (1022-1029); burst rate limit `albumArtGenerationBurstLimiter` (1066).
- **`apps/web/app/api/chat/album-art/create-release-and-apply/route.ts:34` — `POST`** → `createReleaseAndApplyGeneratedAlbumArt` in `apps/web/lib/services/album-art/apply.ts:219` (insert at 256).
  - Validation: zod `chatToolSchema` (route.ts:20-32): uuid `profileId`/`generationId`/`candidateId`, `title min(1).max(200)`, `releaseType` enum incl. mixtape/other, `releaseDate` refined ISO date. Ownership via `getOwnedProfile` (apply.ts:35).
  - Entitlement: `requireAlbumArtUser()` (`apps/web/app/api/chat/album-art/shared.ts:7`): flag `ALBUM_ART_GENERATION` via `getAppFlagValue` (17) + `getCurrentUserEntitlements().canGenerateAlbumArt` (30) — gates on the *album-art* entitlement, not `canCreateManualReleases`.
  - Idempotency: none — `generateUniqueSlug` + pre-generated `randomUUID()` release id; plain insert; failure path deletes processed artwork (279).
  - Errors: HTTP 401 `{error:'Unauthorized'}`, 404 flag-off, 403 plan, 400 `{error, details: fieldErrors}`, 500 `{error:'Failed to create release with generated album art'}`.

### Audio upload → draft single

- **`apps/web/app/api/chat/audio/route.ts:27` — `POST`** → `routeChatAudioUpload` in `apps/web/lib/chat/route-audio-upload.ts`; `createDraftSingleWithAudio` (118) calls `upsertRelease` (130) + `upsertRecording` + `upsertReleaseTrack`, `metadata: { chatAudioUpload: true }`.
  - Validation: zod `chatAudioSchema` (route.ts:19-25) for blob fields; title inferred by `inferAudioEntity` (no schema on title).
  - Entitlement: `requireAuth` only (route.ts:28); no release-creation entitlement/quota.
  - Idempotency: `generateUniqueSlug` + upsert-on-conflict (same overwrite caveat).
  - Errors: 400 `{error, details}`, 403 `{error:'Creator profile not found'}`, 200 result JSON.

### Ingestion (Spotify import creates/updates releases)

**`apps/web/lib/discography/spotify-import.ts:843` — `importSingleRelease`** → `upsertRelease` (892; explicit-flag fix-up at 824), invoked by `syncReleasesFromSpotify` (1000). `sourceType: 'ingested'`.

- **Validation:** `sanitizeAlbumMetadata` (sanitizes title/label/UPC/artwork URL), `classifySpotifyReleaseType`, `parseSpotifyReleaseDate`, `maxTracksPerRelease` cap. No zod.
- **Entitlement:** none on import itself; one trigger is rate-limited (below).
- **Idempotency:** looks up existing release by `metadata->>'spotifyId'` to preserve slug (854-866), then `generateUniqueSlug` with year disambiguation (881-889) + `onConflictDoUpdate(creatorProfileId, slug)`.

Triggers of `syncReleasesFromSpotify`:

- `actions.ts:967` `syncFromSpotify` — dashboard "Sync from Spotify" button; auth via `requireProfile`, requires `profile.spotifyId`; error contract `{success, message, imported, errors}`; **no rate limit/entitlement**.
- `actions.ts:648` `refreshRelease` (calls sync at 698) — plan-aware rate limit `checkReleaseRefreshRateLimit(releaseId, plan)` with plan from `getCurrentUserEntitlements()` (670-679); returns `{release, rateLimited, retryAfter}`.
- `actions.ts:1296` `connectSpotifyArtist` (sync at 1484) — dashboard Spotify connect; unique constraint `creator_profiles_spotify_id_unique` handled at 92-98.
- `apps/web/app/onboarding/actions/connect-spotify.ts:526` — `connectOnboardingSpotifyArtist` (onboarding claim flow); E2E fast path caps `maxReleases: 1, maxTracksPerRelease: 6` (519-524); marks import failed via `markSpotifyImportFailed` on error (546).

### Core library

- **`apps/web/lib/discography/queries.ts:636` — `upsertRelease(input: UpsertReleaseInput)`** — the shared write path for chat tool, audio upload, and Spotify import. `onConflictDoUpdate` target `[creatorProfileId, slug]` (667). No validation, no entitlement, no idempotency key — all pushed to callers (inconsistently).
- **`apps/web/lib/discography/slug.ts:199` — `generateUniqueSlug`** — collision handling (base → year → `-2..-100` → random suffix) used by chat/album-art/audio/ingestion but **not** by the dashboard `createRelease` action.

### Surfaces with NO release-creation path (verified)

- **Extension** (`packages/extension-contracts/index.ts:12-16`, workflows `distrokid_release_form`/`awal_release_form`; `apps/web/app/api/extension/actions/fill-preview/route.ts`): fills *external distributor* forms from an **existing** release (`entityKind: z.literal('release')` with `entityId`). No Jovie release creation.
- **iOS/macOS** (`apps/ios`): chat entity chips/labels only; no native create — release creation would go through the shared web chat tool.
- **Desktop/Electron** (`apps/desktop/src`): no matches.
- **MCP / CLI**: no matches anywhere in repo.
- **`apps/web/app/api/admin/releases/route.ts`**: GET-only listing.
- **`apps/web/app/api/release-autopilot/run/route.ts`**, **`release-to-revenue/*`**, **`lib/campaign-ops/release-workflow.ts:73` `createReleaseWorkflow`**, **`lib/release-to-revenue/create-run.ts`**: operate on existing releases (tasks/runs), not release entities.
- **Demo** (`apps/web/components/features/demo/demo-release-experience-adapter.ts:83`): `onCreateRelease` is a disabled toast.
- Seed scripts insert releases directly (tests/scripts only): `apps/web/scripts/drizzle-seed.ts:1076`, `seed-demo-account.ts:506`, `tests/seed-test-data.ts:1444`.

### Duplicated / divergent logic (centralization targets)

1. **Entitlement gap**: `canCreateManualReleases` is client-only gating; no server enforcement in the dashboard action, chat tool, audio upload, or ingestion. Album-art route instead checks `canGenerateAlbumArt` + `ALBUM_ART_GENERATION` flag — a different axis entirely.
2. **`releaseType` enums diverge**: dashboard action TS type lacks `'mixtape'|'other'`; chat tool and album-art zod schemas include them. Three separate declarations.
3. **Title validation triplicated**: zod `min(1).max(200)` in chat tool and album-art route vs. manual trim in `createRelease` (no max length).
4. **Slug strategy split**: `generateUniqueSlug` (collision-resolving, used by chat/audio/album-art/Spotify) vs. raw `slugify` + unique-violation catch in the dashboard action.
5. **Insert vs. upsert semantics**: dashboard + album-art do plain inserts (fail on conflict); chat tool + audio + Spotify upsert and silently overwrite same-slug releases.
6. **Date handling**: zod regex+refine (album-art), regex + manual `Date` check (chat tool), unchecked `new Date()` (dashboard action), `parseSpotifyReleaseDate` (ingestion).
7. **Error contracts are per-surface**: server-action `{success,message}` / tool-result `{success,error}` / HTTP `{error,details?}` with varying status codes (400/401/403/404/500).

### Summary count (entry points that can create a `discogReleases` row)

| Surface | Entry points |
| --- | --- |
| Dashboard server action (`createRelease`) | 1 |
| Chat tool (`createReleaseTool`) | 1 |
| Album-art REST route (`create-release-and-apply`) | 1 |
| Chat audio upload (`POST /api/chat/audio` → draft single) | 1 |
| Spotify ingestion (`syncReleasesFromSpotify` via 4 triggers: `syncFromSpotify`, `refreshRelease`, `connectSpotifyArtist`, onboarding `connectOnboardingSpotifyArtist`) | 1 mechanism, 4 triggers |
| Extension / iOS-native / macOS-native / Electron / MCP / CLI / Admin API | 0 |

Total: **4 direct create entry points + 1 ingestion mechanism (4 triggers)**, converging on 3 DB write sites, with validation/entitlement/idempotency logic fragmented across all of them.

---

## 4. `task.create` — creating a workspace task

The `tasks` table is written from exactly **4 insert sites**, exposed through **5 server actions + 1 chat tool**. No REST, mobile, iOS/macOS, Electron, MCP, or CLI entry points exist.

### Write paths into the `tasks` table

**1. `createTask` — dashboard Tasks server action** — `apps/web/app/app/(shell)/dashboard/tasks/task-actions.ts:626` (core: `createTaskForProfile` :249, insert :263)

- **What:** Creates one task; reserves `taskNumber` by incrementing `creatorProfiles.nextTaskNumber` (:221), computes `position = max+1` (:212).
- **Validation:** **none server-side** — TS interface `CreateTaskInput` only (`apps/web/lib/tasks/types.ts:99`). Client checks non-empty trimmed title only (`TasksPageClient.tsx:1982-1985`). A drizzle-zod `insertTaskSchema` exists (`apps/web/lib/db/schema/tasks.ts:94`) but is **never used**.
- **Entitlement:** `requireTasksWorkspaceAccess()` (`apps/web/lib/entitlements/tasks-gate.ts:48`) → `getCurrentUserEntitlements().canAccessTasksWorkspace`; throws `TasksUpgradeRequiredError` code `TASKS_WORKSPACE_LOCKED`, logs via `logEntitlementDenial`. Auth: `requireProfileId()` (redirect-based, `app/(shell)/dashboard/requireProfileId.ts:7`).
- **Idempotency:** **none** (no key); single retry on PG `23505` against unique index `tasks_creator_task_number_unique` (:240-247, :297-303).
- **Errors:** server-action thrown `Error` / `TasksUpgradeRequiredError` (serialized across the boundary; client matches on `.name`/`.code`).
- **Adapter:** web Tasks page via `useCreateTaskMutation` (`apps/web/lib/queries/useTaskMutations.ts:318`), also called by the chat tool and `addReleaseTask`.

**2. `addReleaseTask` — release detail "add custom task"** — `apps/web/app/app/(shell)/dashboard/releases/task-actions.ts:280` (delegates to `createTask` :295)

- **What:** Also fires async cluster-classification telemetry into `customTaskTelemetry` (:308-350).
- **Validation:** none; manual defaults (`category ?? 'Custom'`, `priority ?? 'medium'`). Own copy of release-ownership check `requireReleaseAccess` (:25).
- **Entitlement:** `requireTasksWorkspaceAccess()` (:291) — then `createTask` **re-checks the same gate** (double check).
- **Idempotency:** none. Errors: same thrown-error contract; hook detects upgrade errors via `isUpgradeRequiredError` (`apps/web/lib/queries/useReleaseTaskMutations.ts:20`).
- **Adapter:** web release detail UI via `useReleaseTaskMutations` (:172).

**3. `instantiateReleaseTasks` — legacy template release plan** — `apps/web/app/app/(shell)/dashboard/releases/task-actions.ts:88`, direct bulk `db.insert(tasks)` at :188 — **bypasses `createTaskForProfile`**

- **What:** Seeds `DEFAULT_RELEASE_TASK_TEMPLATE` (`apps/web/lib/release-tasks/default-template.ts`).
- **Entitlement:** `requireReleasePlanGenerationAccess()` (tasks-gate.ts:60, gate `canGenerateReleasePlans`, code `RELEASE_PLAN_LOCKED`).
- **Idempotency:** task-count early return (:93-106) + re-check before insert (:128-140); hard guarantee is **list-layer `dedupeReleaseTasks`** (comment refs GH-12331) — no DB constraint.
- **Adapter:** `useInstantiateReleaseTasksMutation` (`useReleaseTaskMutations.ts:125`) and chat tool `release_plan` intent.

**4. `instantiateReleaseTasksFromCatalog` — wizard/catalog release plan** — `apps/web/app/app/(shell)/dashboard/releases/catalog-task-actions.ts:83`; tx insert of `tasks` + `release_task_snapshots` (:186-229), persists wizard answers onto `discogReleases.metadata`

- **Validation:** catalog-driven via `selectTasks` (`apps/web/lib/release-tasks/select-tasks.ts`); throws on missing catalog row (:136).
- **Entitlement:** `requireReleasePlanGenerationAccess()` (:87); third copy of `requireReleaseAccess` (:29).
- **Idempotency:** pre-check + in-transaction re-check on existing task count (:91-103, :187-197); no constraint.
- **Adapter:** release wizard — `release-plan-generation.ts:43`, `ReleaseProviderMatrix.tsx:653`.

**5. `addCatalogTaskToRelease` — add one catalog task** — `apps/web/app/app/(shell)/dashboard/releases/catalog-task-actions.ts:320`, tx insert at :389

- **Validation:** manual slug lookup, throws `Unknown catalog slug: ${slug}` (:342).
- **Entitlement:** `requireTasksWorkspaceAccess()` (:321).
- **Idempotency:** **real one** — `UNIQUE(release_id, catalog_slug)` on `release_task_snapshots`, in-tx re-check (:367-377), `23505` treated as success (:432-441).
- **Adapter:** `CatalogTaskBuilderDialog.tsx:95`.

**6. Chat tool `manageTasks` (intents `create` / `release_plan`)** — `apps/web/lib/chat/tools/tasks.ts:37` (create path :96-100 → `createTask`; release_plan :75-94 → `instantiateReleaseTasks`)

- **Validation:** **the only zod on any create path** — `chatToolSchema({ intent enum, title max 200, releaseId uuid })` (:40-44); fallback title `'Untitled task'`.
- **Entitlement:** **two layers** — route swaps in a locked stub via `resolveLockedChatTools`/`buildLockedToolSet` (`apps/web/app/api/chat/route.ts:2846-2855`; gate map `manageTasks: 'canAccessTasksWorkspace'`, `apps/web/lib/chat/locked-tools.ts:39`), and the underlying server actions re-check anyway.
- **Errors:** structured tool results `{ success:false, error, errorCode: 'PROFILE_REQUIRED'|'RELEASE_ID_REQUIRED', retryable }`; locked stub returns `{ success:true, locked:true, gate, reason, plan_required, upgrade_cta, summary }` (locked-tools.ts:49-63).
- **Idempotency:** none for `create`; inherits count-check for `release_plan`.
- **Adapter:** `/api/chat` route (route.ts:2043-2045), only when `resolvedProfileId` exists.

### Surfaces with NO task-creation entry point (verified by grep/read)

- **REST API:** no `app/api/tasks/**` routes exist at all.
- **Mobile API** (`app/api/mobile/v1/*`): no task endpoints; `lib/mobile/chat/turn-handler` does not register `manageTasks`.
- **iOS** (`apps/ios`): no task creation (`ChatRepository.swift:25` is just a SwiftUI `.task` modifier).
- **macOS, desktop (Electron), extension, console, eve-pilot:** zero matches.
- **MCP** (`app/api/mcp/[username]/route.ts`): no task tools.
- **Internal job-queue "tasks" (excluded):** `lib/campaign-ops` `ReleaseWorkflowTask` / `'create_tasks'` step label (types.ts:40,273) is an in-memory approval-workflow concept with **no insert into the `tasks` table**.

### Duplicated logic worth centralizing

- **Release-ownership check ×3:** `assertReleaseAccess` (tasks/task-actions.ts:188) vs identical `requireReleaseAccess` copies (releases/task-actions.ts:25, catalog-task-actions.ts:29).
- **Entitlement gate invoked repeatedly on one call chain:** chat route locked-stub gate + server-action gate + nested re-check (`addReleaseTask` → `createTask` both call `requireTasksWorkspaceAccess`); gate knowledge duplicated in `LOCKABLE_CHAT_TOOL_GATES` (locked-tools.ts:34-42).
- **Task-number allocation ×3:** `reserveTaskNumber` (:221) vs inline counter updates (releases/task-actions.ts:142-153, catalog-task-actions.ts:199-208 and :379-387).
- **`position = max+1` ×4:** task-actions.ts:212, releases/task-actions.ts:115-122, catalog-task-actions.ts:121-128, :344-358.
- **Bulk row-building duplicated** between `instantiateReleaseTasks` (:157-186) and catalog `buildTaskRows` (:133-163); `ai_workflow → jovie` assignee mapping repeated in 4 places (:165-168, catalog :144-147, :396-399, addReleaseTask :300 / `resolveAssigneeKind` :249).
- **Validation split-brain:** zod only at the chat-tool boundary; server actions trust TS types; unused `insertTaskSchema` sits in the schema file.
- **Error contract is implicit:** thrown errors crossing the server-action boundary are re-identified client-side by string matching (`isUpgradeRequiredError`), while the chat tool uses a structured `{success, errorCode, retryable}` shape — two different contracts for the same failures.

### Summary counts

| Surface | Entry points |
| --- | --- |
| Web server actions — tasks workspace | 1 (`createTask`) |
| Web server actions — release tasks | 4 (`addReleaseTask`, `instantiateReleaseTasks`, `instantiateReleaseTasksFromCatalog`, `addCatalogTaskToRelease`) |
| Chat tool | 1 tool, 2 create intents (delegates to server actions — not a new write path) |
| REST API routes | 0 |
| Mobile API / iOS / macOS / desktop / extension / console / MCP / CLI / eve-pilot | 0 |

**Total: 5 user-facing server-action entry points + 1 chat tool, funneling into 4 distinct `tasks` insert sites.** The canonical `task.create` contract would collapse these into one validated, entitlement-checked, idempotent core; only `addCatalogTaskToRelease` currently has real DB-backed idempotency.

---

## 5. Cross-client surfaces

These are the surfaces that will later host canonical action adapters, plus the
central entitlement/quota/flag modules the dispatcher will plug into.

### 5a. MCP server(s)

`apps/web/app/api/mcp/[username]/route.ts` — **the ONLY MCP server in the repo**.

- **Line 68 `GET`** — MCP discovery manifest (server name, resource/tool descriptors, `_links`). 404 via `getProfileByUsername` + `isPublic` check. No auth. Errors: `{ error: 'Artist not found' }` + 404 (`NO_STORE_HEADERS`).
- **Line 97 `POST`** — JSON-RPC 2.0 dispatch (`initialize`, `resources/list`, `resources/read`, `tools/list`, `tools/call`). Validation: zod `mcpRequestSchema` discriminated union (line 47) + separate id-parse (line 118). Errors: JSON-RPC envelope `{ jsonrpc:'2.0', id, error:{code,message} }`, HTTP 200 for protocol errors, 404 only for unknown artist.
- **Resources** (`readResource`, line 352): `artist://{username}/bio|releases|events|merch` — read-only, mapped from `getReleasesForProfileLite`, `getUpcomingTourDatesForProfile`, `getLiveMerchCardsForProfile`.
- **Tools — read side (no auth):** `get_ticket_link` (line 419) — manual validation (`String(args.eventId)` + lookup), no entitlement/idempotency, errors `{error: string}` → JSON-RPC `-32602`. `check_merch_availability` (line 433), `add_to_cart` (line 448) — same shape; `add_to_cart` just returns a checkout URL (no cart write).
- **Tools — write side (Clerk session cookie auth, `getCachedAuth()` at line 461):**
  - `generate_merch` (line 464) → `createMerchGeneration()` in `apps/web/lib/merch/service.ts:593`. Zod inline schema (prompt ≤500, itemType ≤80). **No plan-entitlement check** — only ownership via `assertCanManageMerchProfile` (service.ts:126). No idempotency key. Errors collapsed to `'Unable to generate merch options'`.
  - `select_merch_design` (line 499) → `selectMerchDesign()` (service.ts:872+) + `proposeMerchAction` from `@/lib/chat/tools/merch-propose`. Zod inline schema with `.refine` (optionNumber XOR optionId). Idempotency: partial — "A product is already selected" guard (service.ts:990).
  - `publish_merch_card` (line 534) → `publishMerchCard()` gated by explicit `confirmed: true` + sellability checks (`getMerchCardSellability`, `assertSellable` service.ts:405). Zod inline schema. No idempotency key; errors: JSON-RPC `-32602` with generic message.
- **Auth model:** mixed — reads are unauthenticated (public profile only); merch writes reuse the web Clerk cookie session (`getCachedAuth`). No OAuth/API-key MCP auth exists. `.mcp.json` is agent-side client config; `@modelcontextprotocol/sdk` in root package.json is a dev dependency, not a server implementation.
- **Contract note:** `packages/action-contracts` hard-pins `auth.publicArtistMcpWritable === false` on every action — this endpoint never receives canonical workspace writes.

### 5b. CLI surface

**None.** No `bin` field in any package.json (searched all), no `commander`/`yargs`/`cac`/`clipanion` imports, no `cli/` package. `packages/` contains only `action-contracts`, `audio-contracts`, `auth-routing`, `extension-contracts`, `ui`. The only `#!/usr/bin/env node` files are internal dev scripts (`apps/web/scripts/ship-pr.ts`, `drizzle-migrate.ts`, etc.), not a product CLI. The macOS MenuMonitor shells out to an **external** `hermes` CLI not present in this repo.

### 5c. Desktop / Electron (`apps/desktop`)

Desktop is a **shell hosting the Next.js app at `/app/chat`**; it performs no domain creates itself. All IPC is auth/navigation/tray plumbing:

- `apps/desktop/src/main.ts:1682` `ipcMain.handle('quit-and-install')` — updater. Guard: `isTrustedIpcSender` (origin check, line 310). Errors: `{ok:false, reason}`.
- `main.ts:1706/1713` `go-back`/`go-forward` — nav only.
- `main.ts:1730` `start-desktop-auth-handoff` — shows auth window; validates via `buildDesktopBrowserAuthUrl` (PKCE S256 + return-route sanitizer, lines 451–505).
- `main.ts:1751` `open-desktop-auth-url`, `main.ts:1775` `close-desktop-auth-window`, `main.ts:1791` `consume-desktop-auth-completion` — auth completion has 60s replay cache (`AUTH_COMPLETION_REPLAY_TTL_MS`, line 164) — the only idempotency-like mechanism here.
- `main.ts:1944` `dictation-status`, `main.ts:1961` `tray-set-state` (validated by `isTrayAppState`).
- **Closest to a "create" trigger:** `handleTrayAction('new-message')` (main.ts:1654) — sends `tray-action` event to the renderer (`apps/desktop/src/preload.ts:179` `onTrayAction`), which the hosted web app turns into a chat message. So even tray-originated "creates" funnel through the web chat API.
- Preload contract: `apps/desktop/src/preload.ts:64` `contextBridge.exposeInMainWorld('electronAPI', …)`.
- No zod, no entitlement/quota checks, no web-API POSTs in the main process.

### 5d. iOS and macOS

**iOS:** the ONLY write endpoint is chat turns. Contacts/tasks/releases have no native create path — they arrive server-side via chat tools/intent routing.

- `apps/ios/Jovie/Core/MobileChatClient.swift:64` `sendTurn` → `POST /api/mobile/v1/chat/turns` (NDJSON stream). Auth: Bearer token with single 401 force-refresh retry (line 86); terminal 401 clears Keychain (line 90). Client validation: none (encodes request struct). Idempotency: `clientTurnId`/`clientMessageId` UUIDs generated in `ChatRepository.send` (`apps/ios/Jovie/Core/ChatRepository.swift:117-118`). Error mapping: `MobileChatClientError.requestFailed(statusCode)` / NDJSON `{type:'error', errorCode, message}` events.
- Read endpoints in `apps/ios/Jovie/Core/APIClient.swift`: `/api/mobile/v1/me` (line 121), `/api/wallet/apple/profile-pass` (175), `/api/mobile/v1/audience/highlights` (217), `/api/mobile/v1/inbox` (263), `/api/mobile/v1/calendar` (308) — all GET, Bearer + 401-retry + `set-auth-token` header session roll.
- App Intents (`apps/ios/Jovie/Features/Intents/JovieAppIntents.swift`): `SendMessageIntent` (line 20) enqueues `.sendMessage(text:autoSend:true)` → same chat-turn path; `OpenChatIntent`, `StartVoiceCaptureIntent`, `ContinueLastConversationIntent` are navigation-only.

**Server side of iOS chat (the real creation surface):**

- `apps/web/app/api/mobile/v1/chat/turns/route.ts:11` POST — auth `getMobileSessionUserId` (401 `{error:'Unauthorized'}`), validation `parseMobileChatTurnRequest` (**manual checks, not zod** — `apps/web/lib/mobile/chat/contract.ts:72`), 400 `{error:'Invalid request body'}`.
- `apps/web/lib/mobile/chat/turn-handler.ts:110` `handleMobileChatTurn`:
  - **Idempotency (strongest in the repo):** `reserveChatTurn` (`apps/web/lib/chat/turns.ts:222`) with `onConflictDoNothing` + partial unique index `idx_chat_messages_conversation_client_message_unique` (turns.ts:296/344); duplicates return `duplicate_in_progress` → 409 NDJSON `TURN_IN_PROGRESS`, or `duplicate_completed` → replayed assistant message / web handoff.
  - **Quota:** `checkAiChatRateLimitForPlan(userId, plan)` (turn-handler.ts:187; `apps/web/lib/rate-limit/limiters.ts:628`) — hourly burst + daily plan quota (10/100/500 from `ENTITLEMENT_REGISTRY` limits), fail-open on degraded backend. Plan via `resolveChatAccountContext`.
  - **Entitlement:** merch chat tools only mounted when `accountContext.planLimits.booleans.canAccessMerchCreation` (turn-handler.ts:314).
  - Deterministic intents short-circuit to `routeIntent` (`@/lib/intent-detection`) or `web.handoff`.
  - Errors: NDJSON events `{type:'error', errorCode, message}`; codes include `MOBILE_CHAT_PROFILE_REQUIRED`, `TURN_IN_PROGRESS`, `RATE_LIMITED`, `CHAT_STREAM_FAILED`, `ARTIST_CONTEXT_UNAVAILABLE`.

**macOS:** `apps/macos/MenuMonitor/` is an internal ops menu-bar app — polls Hermes kanban/GitHub counts, restarts local daemons via shell. **No** web-API creates, no auth model, no validation. Not an actions surface.

### 5e. Central entitlement / quota / feature-flag modules (what the dispatcher plugs into)

- `apps/web/lib/entitlements/registry.ts` — **the single source of truth**: `ENTITLEMENT_REGISTRY` (line 165), 28 `BooleanEntitlement` keys incl. `aiCanUseTools`, `canCreateManualReleases`, `canAccessTasksWorkspace`, `canAccessMerchCreation`; `NumericEntitlement` limits (`aiDailyMessageLimit`, `contactsLimit`, …). Helpers: `getEntitlements`, `checkBoolean` (574), `getLimit` (582), `resolveChatUsagePlan` (598), `isProPlan` (611), `hasAdvancedFeatures` (622), `resolveCanonicalPlanId` (662). Client-importable.
- `apps/web/lib/entitlements/server.ts:159` `getCurrentUserEntitlements()` — session-based resolution; degrades to free tier on billing failure; admin via `checkAdminRole` + MFA recheck.
- `apps/web/lib/entitlements/creator-plan.ts` — **session-less variant**: `getCreatorEntitlements(profileId)` (line 41), `getBatchCreatorEntitlements` (102), `canCreatorSendNotifications` (202) — used by public pages/crons.
- `apps/web/lib/entitlements/tasks-gate.ts` — throwing gate helpers: `requireTasksWorkspaceAccess` (48), `requireReleasePlanGenerationAccess` (60) → `TasksUpgradeRequiredError` with codes `TASKS_WORKSPACE_LOCKED`/`RELEASE_PLAN_LOCKED`, plus demand-signal logging.
- `apps/web/lib/entitlements/demand-signal.ts:31` `logEntitlementDenial()` — uniform denial telemetry (Sentry breadcrumb + analytics, never throws).
- Quota: `apps/web/lib/rate-limit/limiters.ts:628` `checkAiChatRateLimitForPlan` (burst + daily plan limiter, fail-open).
- Feature flags: `apps/web/lib/flags/contracts.ts` (`APP_FLAG_DEFAULTS` line 31, 19 flags incl. `MERCH_MVP`, `AI_CONNECTORS_BETA`), `apps/web/lib/flags/registry.ts` (`APP_FLAG_REGISTRY` line 44, `flags/next` wrapper), `apps/web/lib/flags/server.ts` (`getAppFlagValue` line 72, `getAppFlagsSnapshot` 113), plus `statsig.ts`, `overrides.ts`, `admin-features.server.ts`, `code-flags.ts` (multiple evaluation paths).
- `packages/auth-routing/index.ts` — cross-client auth contract (web/ios/electron): `sanitizeReturnTo` (257), `buildAuthStartUrl` (277), `resolveAuthCallback` (400), `validateNativeExchange` (495, PKCE + replay/expiry checks), `classifyNavigation` (579). This is the pattern `packages/action-contracts` mirrors.

### Duplicated / fragmented logic (cross-client centralization targets)

- **Plan normalization is implemented twice**: `normalizeBillingPlan` in `entitlements/server.ts:80` vs `resolveEffectivePlan` in `entitlements/creator-plan.ts:23` — both handle trial-expiry-at-read-time and legacy aliases (`founding`/`growth`); the registry comment admits they must be kept "mirrored".
- **Merch gating is inconsistent across surfaces**: MCP merch writes check only ownership (`assertCanManageMerchProfile`, cookie auth) with **no `canAccessMerchCreation` check**; mobile chat mounts merch tools only when `canAccessMerchCreation` is true (turn-handler.ts:314); web chat gates via plan limits separately. Same action, three different gate stacks. The `MERCH_MVP` flag (`flags/contracts.ts:43`) is a fourth, uncoordinated gate.
- **Validation styles are split**: MCP uses zod (route-level + per-tool inline schemas duplicated between `buildToolDescriptors` JSON schemas and runtime zod schemas — hand-kept in sync), mobile chat uses manual guards in `contract.ts`, web chat (`apps/web/app/api/chat/route.ts`) mixes zod with ad-hoc `{ success:false, error:'Profile ID required' }` tool results.
- **Error contracts differ per surface**: JSON-RPC `{error:{code,message}}` (MCP), `{error: string}` + HTTP status (web/mobile routes), NDJSON `{type:'error', errorCode}` (mobile chat), `{success:false, error}` (web chat tools), `{ok:false, reason}` (Electron IPC).
- **Idempotency exists only in chat turns** (`reserveChatTurn` + unique index + client UUIDs). MCP merch writes, desktop IPC, and web chat mutations have none (merch relies on partial state guards like "product already selected").
- **Ownership/auth re-derived per surface**: `getCachedAuth` (MCP), `getMobileSessionUserId` (mobile), `getSessionContext` (chat handler), `getAuthenticatedProfile` (merch service) — four different session/profile resolvers.

### Summary counts (cross-client action-relevant entry points)

| Surface | Entry points | Writes/creates among them |
| --- | --- | --- |
| MCP (`api/mcp/[username]`) | 1 route, 6 tools, 4 resources | 3 tools (generate/select/publish merch) |
| Public read API (`api/v1/[username]`) | 1 GET | 0 |
| CLI | **0** | 0 |
| Desktop Electron IPC | 9 handlers + 1 event | 0 (tray "new-message" defers to web chat) |
| iOS | 1 write (`POST /api/mobile/v1/chat/turns`) + 5 GETs + 4 App Intents | 1 (chat turn; contacts/tasks/releases via server tools) |
| macOS MenuMonitor | internal ops only | 0 |
| Server-side shared spine | `handleMobileChatTurn`, `reserveChatTurn`, `executeChatTurn`, chat tools | the de-facto canonical action pipeline today |
| Entitlement/quota/flag modules | registry + server + creator-plan + tasks-gate + demand-signal + rate-limit + flags/* | — |

Bottom line: there is exactly one MCP server (per-artist, public-read + cookie-authed merch writes), no CLI, no native create paths on desktop/macOS, and iOS creation funnels entirely through the mobile chat turn. The mobile chat turn pipeline (`turn-handler.ts` + `chat/turns.ts`) is the only surface with real idempotency and unified quota enforcement — and is the natural seed for the canonical actions dispatcher, while merch gating, plan normalization, and validation/error shapes are the main duplicated logic to centralize.

---

## 6. Grand totals

| Action | Server entry points | Client initiators | Native (iOS/macOS/desktop) | MCP / CLI / extension |
| --- | --- | --- | --- | --- |
| `chat.start` | 5 prod + 2 internal | 5 | iOS via mobile route only | 0 |
| `contact.create` | 12 routes + 1 server action + 1 ingestion + 2 platform-level (2 webhook-driven, shared) | 4 (all → `/api/notifications/subscribe`) | 0 | 0 |
| `release.create` | 4 direct + 1 ingestion mechanism (4 triggers) | dashboard sidebar + chat | 0 | 0 |
| `task.create` | 5 server actions + 1 chat tool | tasks/release UIs + chat | 0 | 0 |

Only three write paths in the entire inventory have real idempotency today:
`reserveChatTurn` (chat turns, web + mobile), `addCatalogTaskToRelease`
(`UNIQUE(release_id, catalog_slug)`), and the Twilio SMS webhook
(`webhookEvents` dedup). Everything else relies on best-effort unique
constraints, count pre-checks, or nothing. This is the gap the durable
`action_executions` ledger closes (see [MIGRATION_MAP.md](./MIGRATION_MAP.md)).
