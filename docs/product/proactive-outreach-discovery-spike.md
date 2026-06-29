# Proactive Outreach Discovery Spike (Boardy.ai-style)

Discovery spike for **GitHub #12169**. Output: build-vs-adopt verdict, consent
model, and a Phase-1 thin-slice spec with a go/no-go. This is a strategy
document — no feature code ships from this issue. Implementation is tracked as
follow-up issues (see [Follow-ups](#follow-ups)).

> **gbrain note:** the Air-hosted brain was mid-migration during this spike and
> returned no usable results; competitive context below is grounded in the
> public Boardy surface + verified codebase facts, not gbrain recall. Re-run a
> gbrain query when it is back if deeper prior-art is needed.

## TL;DR — Go / No-Go

**GO on Phase 1 (message), NO-GO on Phase 2 (voice) until Phase 1 proves lift.**

The surprising finding: **most of the "lake" is already built.** The send path,
the consent ledger, the TTS provider, and even the release-timing "brain" all
exist in-repo today. What is missing is a single, small bridge — pushing the
*artist-facing* release opportunity the system already computes to an
*artist-facing* outbound channel, behind a new artist-outreach consent toggle.
The issue's premise that the SMS send path is "stubbed" is **stale** — it is
wired to Twilio and merely flag-gated (`OUTBOUND_SMS_ENABLED`).

The one correction that changes the plan: the existing release-notification
pipeline is **fan-facing**, not artist-facing (details below). So Phase 1 is a
new thin slice that *reuses primitives*, not a flip of an existing switch.

## Boardy.ai teardown (grounded; unknowns marked)

- **What it is:** an AI "superconnector" persona (founder Andrew D'Souza,
  ex-Clearco). You talk/message Boardy; it learns who you are and what you want,
  then proactively makes warm, double-opt-in intros from its network.
- **Copyable decisions:**
  1. **Voice/conversational agent as the interface** — a call extracts richer
     context than a form and feels high-trust.
  2. **A persona, not a tool** — "Boardy" is a memorable, shareable character.
  3. **Proactive outbound *with a reason*** — it reaches out to you.
  4. **Double-opt-in** — quality + safety + network effect (every member is both
     supply and demand).
  5. **Outcome framing** — sells intros / $ matched, not features.
  6. **Referral-native virality** — every intro exposes a new person.
  7. **Scarcity launch** — "free for the next N".
- **Unknowns (do NOT fabricate):** telephony/voice/LLM stack, call lengths, real
  retention/conversion metrics. A deep Exa research report was commissioned and
  is **pending**; fold it in when it lands and revise the stack section if it
  contradicts the assumptions here.

## Transfer to Jovie — the artist-vs-fan distinction (key insight)

Boardy's wedge is "I know who you should meet before you do." Jovie's analog is
**"I know what you should ship before you do"**: message/call the artist *before*
a release with ready-to-go posts/merch/campaign.

The trap to avoid: assuming the existing notification pipeline already does this.
It does not — it points the other way.

| | **Existing pipeline (fan-facing)** | **This issue (artist-facing)** |
|---|---|---|
| Recipient | The artist's **fans/subscribers** | The **artist** (the Jovie user) |
| Trigger | Release goes live | Release **upcoming** (T-minus) |
| Intent | "New music from X is out" | "Your release drops Friday — want me to ship your posts?" |
| Consent basis | Fan SMS opt-in (TCPA, `notificationSubscriptions`) | Artist opt-in to be nudged about their own work |
| Code today | `cron/send-release-notifications` + `fanReleaseNotifications` | `MemoryOpportunityGenerator.buildReleaseOpportunities` (in-app only) |

The artist-facing brain **already exists**:
`apps/web/lib/memory/opportunity-generator.ts` computes a "release in the next 7
days" opportunity per artist (`buildReleaseOpportunities`, `approvalRequired:
true`) — it just surfaces in-app (pull), never pushed. Phase 1 = give that
opportunity a push channel.

## Build vs. Adopt verdict (prior-art gate)

Category: *proactive, consent-gated outbound messaging for an existing user
base, timed off release data.* Nearly every component is already adopted or
in-repo. **Net: assembly, not building.**

| Component | Verdict | What exists today | Gap for Phase 1 |
|---|---|---|---|
| **SMS send path** | **Adopt (in-repo)** | `lib/notifications/providers/sms/outbound-sms.ts` → Twilio, flag-gated `OUTBOUND_SMS_ENABLED` | Send via the **suppression-checked `sendNotification` service** (as the fan cron does), **not** raw `sendOutboundSms()` — the raw primitive skips the STOP ledger |
| **Consent ledger** | **Adopt (in-repo)** | `notificationContacts` (`smsConsentAt`, `smsConsentTextHash`, `smsConsentVersion`, `smsStatus`); STOP/HELP in `api/webhooks/sms` | Track artist-outreach consent **and opt-out independently** from the fan path (scope/purpose field or per-artist toggle gating the new ledger) — a version string alone does **not** isolate STOP state on the shared `smsStatus` |
| **Release-timing brain** | **Adopt (in-repo)** | `MemoryOpportunityGenerator.buildReleaseOpportunities` (T-7 window) | Bridge opportunity → outbound send |
| **Scheduling** | **Adopt (in-repo)** | Existing cron fleet (`cron/frequent`, `daily-maintenance`) | Add one sub-step; **do not** add a new cron route |
| **TTS / voice** | **Adopt (in-repo)** | ElevenLabs adopted: `ELEVENLABS_API_KEY` + `voice-promo.ts` makes a live TTS call (`voice-clone.ts` is still a stubbed contract) | Phase 2 only |
| **Inbound STT** | **Adopt (in-repo)** | Web Speech API: `lib/chat/transcriber.ts`, `useSpeechRecognition` | Server STT is Phase 2+ |
| **AI phone calls** | **Adopt (evaluate)** | None | Phase 2: evaluate **Vapi / Retell / Bland** (Twilio+TTS+LLM wrappers) vs raw Twilio. **Do not build a calling stack.** |

**No net-new external primitives to build or adopt.** Phase 1 adds only a thin
opt-in toggle, a cron sub-step, and a dedupe ledger — all wrappers over parts
that already exist in-repo. No new provider, no new TTS/telephony, no new cron
route.

## Consent & legal model

Reuse the TCPA machinery already built (GitHub #8068), do **not** reinvent it.

- **Phase 1 (artist SMS):** artist opts in to proactive release nudges via an
  explicit settings toggle. Persist consent through the existing
  `notificationContacts` primitives with a **new consent version string**
  (e.g. `artist_outreach_v1`). But a version string alone does **not** scope
  opt-out — `smsStatus` is global per phone, so artist and fan STOP state would
  collide. Track artist-outreach consent and opt-out **independently** (a
  scope/purpose field, or a per-artist toggle that gates the new ledger), and
  define the global-STOP ↔ toggle interaction explicitly. STOP/HELP inbound is
  still honored by the existing `api/webhooks/sms` handler for any sender.
- **Phase 2 (voice):** AI calls are higher TCPA risk and need **separate express
  consent** (voice is not covered by an SMS opt-in). Mirror Boardy: opt-in /
  inbound-initiated, earn the right to call. Gate calls behind their own consent
  version and a per-artist toggle.
- **Hard line:** no cold outreach. Every recipient is an existing, opted-in
  Jovie user being messaged about **their own** release.

**Phase-1 TCPA gates the implementer must not skip** (surfaced by security
review — none reopen the build-vs-adopt decision, all are Phase-1 acceptance
criteria):

- **Send through the suppression gate.** Use the `sendNotification` service /
  channel handler, not raw `sendOutboundSms()` — suppression
  (`isPhoneSmsSuppressed()` → `smsStatus = stopped/blocked`) is enforced in the
  service layer, not the raw primitive. Raw sends would text a STOP'd artist.
- **Quiet hours.** No quiet-hours logic exists in-repo today. An engagement
  nudge is closer to solicitation than the fan transactional path — gate sends
  to ~8am–9pm in the **artist's** local time zone (state mini-TCPA laws are
  stricter).
- **Disclosure in the opt-in text.** The `artist_outreach_v1` consent copy (the
  string hashed into `smsConsentTextHash`) must state message frequency
  (~1/release), "Msg & data rates may apply", and STOP/HELP instructions.
- **A2P 10DLC use case.** Artist engagement is a **different** campaign/use case
  than fan release alerts. Confirm it's covered by an existing 10DLC
  registration or register a new campaign before enabling the flag — otherwise
  carriers filter/block.
- **Global STOP ↔ per-artist toggle.** Inbound STOP flips the **global**
  `notificationContacts.smsStatus`. Define the intended interaction with the new
  per-artist outreach toggle so opt-out is unambiguous and auditable.
- **Consent provenance.** Record when/where/how the artist flipped the toggle
  (timestamp + consent text hash + version minimum; an audit row is better) so
  the opt-in is defensible.

## Phase 1 thin slice (recommended next step)

**Goal:** for artists who opt in, send one SMS at T-minus (release in the next 7
days) with a CTA into the release plan — "Your release `<title>` drops `<date>`.
I've drafted your cross-platform posts. Open Jovie to ship them."

**Wiring (smallest correct path):**
1. Settings toggle → write `artist_outreach_v1` consent via existing
   `notificationContacts` primitives.
2. New cron **sub-step** (folded into an existing cron, per `infra.md` — no new
   route) reads `MemoryOpportunityGenerator` release opportunities for opted-in
   artists and sends via the **suppression-checked `sendNotification` service**
   (the same path the fan cron uses) — never the raw `sendOutboundSms()`
   primitive, which skips the STOP ledger.
3. Durable dedupe/state in a table (not in-memory, per `security.md`); reuse the
   `fanReleaseNotifications` status pattern as the template for an
   `artistReleaseNudges` ledger. **Dedupe on an immutable `release_id` (not the
   release date)** so a moved release date can't trigger a duplicate send; store
   the date as a separate column for tracking.
4. Measure: opt-in rate, message→open rate, release-plan activation lift,
   free→Pro conversion among nudged vs. not.

**Cost Impact (order-of-magnitude — verify provider pricing before ship):**
- SMS: ~1 message per opted-in artist per release. At 1,000 opted-in artists
  releasing monthly ≈ **~1,000 SMS/month** ≈ low single-digit dollars at Twilio
  list (~$0.0079/segment) + A2P 10DLC fees. **O(opted-in artists), not O(users)**
  — no per-user API loops.
- No new external polling; the brain is local DB.

**MRR framing (decision-as-system, per operating principles):**
- **Ship now:** Phase 1 (message) — reach = all artists, frequency = every
  release, annoyance solved = "launching is work" (the core wedge), cost = LOW.
- **Re-evaluate when:** nudged-cohort free→Pro conversion or release-plan
  activation beats control by a pre-registered margin (set the threshold before
  launch).
- **Then:** if lift is real, fund Phase 2 (voice); if flat, stop at message and
  do not spend voice minutes.

## Phase 2 (voice) — sketch only, NO-GO until Phase 1 proves lift

Opt-in voice check-in/onboarding via ElevenLabs (already adopted), then
release-week AI calls for high-value artists via an adopted call layer
(Vapi/Retell/Bland over Twilio). Separate express voice consent. Voice minutes
meter fast — reserve for high-value moments only.

## What NOT to build (flag the ocean)

- **No "Jovie superconnector network."** Do not build an artist↔collaborator
  intro graph now. That is the ocean. (Closest analog: GitHub #8677 collaborator
  matching — keep it separate and later.)
- **No new cron route**, no polling external APIs, no per-user API loops, no
  in-memory dedupe (`infra.md`, `security.md`).
- **No new TTS/telephony build** — adopt.
- **No persona/voice-character work** in Phase 1 — message first, earn voice.

## Follow-ups

Per `.claude/rules/linear.md`, the deferred phases are tracked in Linear, not as
orphan bullets:

- **Phase 1 (message), Required:**
  [JOV-3697](https://linear.app/jovie/issue/JOV-3697) — artist-facing proactive
  release-moment SMS thin slice.
- **Phase 2 (voice), Candidate:**
  [JOV-3698](https://linear.app/jovie/issue/JOV-3698) — opt-in voice check-in +
  release-week calls; `blockedBy` JOV-3697 (Phase-1 lift).
- **Exa Boardy report:** fold into the teardown + stack section when it lands.
