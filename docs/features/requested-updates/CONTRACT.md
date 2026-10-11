# Requested Updates contract (JOV-7506)

Canonical brief for the first requested-update loop, applying the
DJ-first / shared-core boundary approved in
[JOV-3392](https://linear.app/jovie/issue/JOV-3392/audience-relationship-development-dj-first-shared-core-portable).
DJs are the first customer; the same core must serve a non-music
(podcast-resource) request with no music account, credentials, or
music-only schema dependency. This document is source-grounded: every
"available" claim below names the file that implements it. Ticket status
is not runtime evidence; "unverified" marks claims we could not confirm
from source.

Executable contract: `apps/web/lib/notifications/requested-updates.ts`.
Executable boundary checks:
`apps/web/tests/unit/lib/notifications/requested-updates.test.ts`.

## 1. Source / build inventory

### Available (verified in source)

- **Ask Jovie intake (JOV-6570, marked Done — verified).**
  `apps/web/app/api/profile/[username]/ask/route.ts` accepts
  `question` | `message` | `intent` | `outcome` actions and persists to
  `profile_inquiries` (`apps/web/lib/db/schema/profile-inquiries.ts`).
  Intent taxonomy (`apps/web/lib/ask-jovie/answer.ts:815`):
  `new_release_alerts`, `local_show_alerts`, `ticket_sale_alerts`,
  `general_updates`. Intents are stored with `visitorEmail`, optional
  `visitorCity`, and `context.surface = 'ask_jovie'`. Rate-limited,
  unauthenticated, no-store.
- **Person / organization.** `creator_profiles`
  (`apps/web/lib/db/schema/profiles.ts:114`); contacts/people under
  `creator_contacts`, `creator_contact_people` (profiles.ts:292+).
  Identity: `ba_users` (better-auth) and `users`.
- **Audience identity.** `audience_members`
  (`apps/web/lib/db/schema/analytics.ts:30`) — per-creator fan identity
  with `type` enum (`anonymous|email|sms|spotify|customer` +
  mention kinds), `fingerprint`, engagement, and denormalized
  `has_active_alerts` / `active_alert_channels` (JOV-1842).
- **Interest / request (standing).** `notification_subscriptions`
  (analytics.ts:499) — per-creator-channel subscription with double
  opt-in (`confirmed_at`), per-artist SMS consent ledger
  (`sms_consent_at`/`_text_hash`/`_version`, check-constrained to be
  all-or-nothing), `unsubscribed_at`, and `FanNotificationPreferences`.
  Point-in-time interest: `profile_inquiries` (above).
- **Consent (global).** `notification_contacts`
  (`apps/web/lib/db/schema/notifications.ts:22`) — cross-creator
  first-write-wins SMS consent and global suppression. `sms_subscribe_intents`
  carry the one-time JOIN handshake.
- **Evidence / provenance.** `context_facts` and `external_objects`
  (`apps/web/lib/db/schema/connectors.ts:189,297`); `suggested_actions.sourceRefs`
  links a proposal to its evidence.
- **Proposed action + approval.** `suggested_actions`
  (connectors.ts:416) — `pending → approved → executed` CAS ladder with
  `idempotency_key`; `workflow_runs` supports `waiting_for_approval`.
  Creator-facing approvals: `profile_action_approvals` /
  `profile_approval_events` (`profile-approvals.ts:27,62`).
- **Delivery / outcome receipt (music specialist).**
  `fan_release_notifications` (`dsp-enrichment.ts:148`) — per-release,
  per-subscription queue rows with `dedup_key` unique index, status
  (`pending|scheduled|sending|sent|failed|cancelled`), `sent_at`, `error`.
  Senders: `sendNotification` (`lib/notifications/service.ts:436`) —
  channel-based, not creator-type-based — plus Resend email, Twilio SMS,
  web push providers; delivery logging in `lib/notifications/suppression.ts`.
- **Scheduling.** `lib/notifications/campaign-scheduling.ts` (JOV-2211)
  — draft → segment → schedule → send with idempotent batch upserts.
- **Shared eligibility precedent.** `lib/notifications/release-eligibility.ts`
  — pure gate function; the profession-agnostic counterpart is
  `requested-updates.ts` (this change).

### Missing (gaps)

- **No generic Work table.** Typed works live per discipline:
  `discog_releases`/`discog_tracks`/`discog_recordings` (content.ts) are
  music-only. There is no `works` row a podcaster could target; the
  shared contract uses `WorkRef { kind, id }` resolved by specialist
  modules instead of forcing one schema.
- **No per-work requested-update table.** `notification_subscriptions`
  models standing interest in a creator; `profile_inquiries` models
  captured intent text. Neither persists "notify me about *this* work
  when *this* condition holds." A thin request/fulfillment table is the
  expected implementation child (see §5 holds).
- **No profession-agnostic fulfillment queue.**
  `fan_release_notifications.release_id` is `NOT NULL` → `discog_releases`;
  it cannot queue a podcast-resource update.
- **Music coupling in the existing eligibility gate.**
  `getReleaseNotificationEligibility` requires `spotifyId` and
  `releaseSourceType === 'spotify'`. Correct for the release-day
  specialist; not reusable for non-music works. The shared gate added
  here drops those requirements entirely.

### Unverified (not proven from source in this pass)

- Whether any cron currently walks `profile_inquiries` intents into
  `notification_subscriptions` rows (Ask Jovie captures intent email;
  conversion to a confirmed subscription is not evidenced in this pass).
- Whether `workflow_runs` actually drives fan-notification delivery end
  to end; it is wired for connector actions.
- Linear/gbrain unreachable from this environment (`mcp_list_tools` for
  the `linear` server failed); JOV-3392's approval text is taken from
  the commissioning brief, not re-verified against the ticket.

## 2. Owner-path map

| Concept | Canonical owner |
|---|---|
| Person / organization | `creator_profiles`, `creator_contacts*` (profiles.ts); `ba_users`/`users` |
| Typed work | Per discipline: `discog_*` (music); resolved via `WorkRef.kind` + specialist module |
| Interest / request | `notification_subscriptions` (standing), `profile_inquiries` (captured intent) |
| Evidence / provenance | `context_facts`, `external_objects`, `suggested_actions.source_refs` |
| Creator/work/purpose/channel permission | `notification_subscriptions` (`confirmed_at`, preferences, `unsubscribed_at`) + `notification_contacts` (global SMS consent) |
| Condition | `WorkUpdateCondition` (`requested-updates.ts`); verified evidence lands via `context_facts`/`external_objects` |
| Proposed action | `suggested_actions` (kind is open text; payload per kind) |
| Approval | `suggested_actions` CAS ladder; `profile_action_approvals`; `workflow_runs.waiting_for_approval` |
| Delivery / outcome receipt | `fan_release_notifications` (music specialist); shared senders in `lib/notifications/service.ts`; `email_send_attribution`, delivery logs in `suppression.ts` |

## 3. The additive contract

`getRequestedUpdateEligibility` in
`apps/web/lib/notifications/requested-updates.ts` is the smallest
additive surface for the promise:

> A verified subscriber requests an update about a particular work; it
> is fulfilled only after the condition is verified and the subscriber
> is still eligible at fulfillment time.

Inputs are plain flags (claim status, entitlement, trial counters,
permission state, work availability, `condition.verifiedAt`). It has
**no** Spotify/DSP/track fields and imports only the shared trial
constant. Gate order is dedupe → claim → entitlement → trial →
withdrawn → unconfirmed → work gone → condition unverified.

Domain metadata rides on `RequestedUpdate.domain` (e.g. a DJ's promo
pool id, a podcaster's feed id) without profession switches in shared
fields.

## 4. Scenarios on one contract

Both run in `requested-updates.test.ts`:

- **DJ:** `WorkRef{kind:'release'}` + condition `release_date_reached`,
  SMS channel, `domain.promoPool` metadata. Eligible once verified.
- **Podcast resource:** `WorkRef{kind:'resource'}` + condition
  `work_published`, email channel, `domain.feedId`/`episodeGuid`.
  Eligible with zero music fields, accounts, or credentials.

Neither scenario renames a music field, fabricates a DSP account, or
adds a second consent/delivery implementation.

## 5. Adverse cases (named for implementation/certification children)

Encoded as named reasons; tests pin each:

- **Cross-creator mismatch** — request targets a subscription on another
  profile: caught by `notification_subscriptions.creator_profile_id`
  scope plus per-request `profile_not_claimed`/`notifications_disabled`
  checks on the *owning* profile.
- **Ambiguous work** — `WorkRef.kind`/`id` resolves to nothing or
  multiple works: specialist resolver must return `work_unavailable`;
  contract requires an exact `id`, never a title match.
- **Interest without permission** — `no_verified_permission` (unconfirmed
  subscription or preference gap).
- **Withdrawn consent** — `permission_withdrawn` (`unsubscribed_at` /
  STOP); re-verified at fulfillment, not request, time.
- **Changed/unpublished work** — `work_unavailable`.
- **Duplicate/reordered events** — `already_fulfilled` checked first,
  matching the `fan_release_notifications.dedup_key` unique index and
  `suggested_actions` CAS pattern.
- **Connector/sender unavailable** — delivery failures stay on the
  receipt row (`fan_release_notifications.status='failed'`/`error`);
  eligibility is pre-send and never swallows provider errors.
- **Agent authorization parity** — proposed fan-facing sends must pass
  the same `suggested_actions` approval ladder regardless of which agent
  or surface produced them (`sourceRefs` keep provenance auditable).

## 6. Specialist-module boundaries (optional, disconnected by default)

- **Music specialist:** `release-eligibility.ts`,
  `campaign-scheduling.ts`, `fan_release_notifications`, `discog_*`.
  Owns Spotify/catalog gates and the release FK. When disconnected
  (podcast account), none of these load: shared eligibility, consent,
  and senders still work.
- **Shared core:** `requested-updates.ts`,
  `notification_subscriptions`, `notification_contacts`,
  `service.ts` senders. Must never import `discog_*`/DSP modules —
  enforced by the boundary tests.
- New disciplines add a `WorkRef.kind` + a specialist resolver + an
  optional fulfillment queue table; they do **not** add required
  imports, credentials, or sender forks to the shared path. No new
  services, graph database, plugin framework, or schema migration is
  introduced here.

## 7. Holds and unblock evidence

- **Current gate:** implementation children (request table, fulfillment
  queue, Ask Jovie intent→subscription conversion) remain **blocked**
  pending Symphony/Linear intake disposition — this issue is scoped to
  source inventory + contract + boundary tests only. Owner: Symphony
  intake / repo owners per `docs/PR_FLOW.md`. Unblock evidence: an
  accepted child issue naming the owner table and sender path, plus CI +
  Migration Guard on its migration PR.
- **No customer sends** from this issue; the contract is a pure
  function + tests.
- **Historical holds** (parent codex-blocked/deployment holds) are not
  revived or removed here; this disposition covers bounded source/reuse
  verification only. Unverified items in §1 must be re-confirmed from
  source before a child claims them.
