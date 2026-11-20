# Outreach engine

Decision date 2026-10-29. Code: `apps/web/lib/outbound/cold/`. Review surface:
Ovie Outbound (`/app/admin/outbound`). Summer read: `GET /api/internal/ovie/outreach-engine`.
Sending streams: [email-sending-streams.md](email-sending-streams.md).

## What it does

Jovie finds independent artists from public sources, builds them something real
from their own public catalog (a Jovie profile or a release page with a smart
link), certifies it, and drafts a short plain-text email from Tim that says
"I built you this, here it is". Tim approves, edits or rejects each draft. Every
edit is stored and mined, so the drafts get closer to what Tim would write.
When a segment's drafts need no change at p95 over 50 reviews and
deliverability is healthy, that segment can send without review. A controller
decides how many emails leave per day and from which inbox, and pauses itself
when bounces or complaints rise.

## Pipeline (event per stage, timestamped by lead id)

| Stage | Owner today | Timestamp source |
|---|---|---|
| prospected | lead discovery (`lib/leads`), public pages only | `leads.created_at` |
| built | ingestion / agent draft (`lib/agent-acquisition`) | `leads.ingested_at` |
| certified | founder `profile:certification` (JOV-7321); machine per-profile checks join from the waitlist-gate work | ledger row time |
| drafted | `outboundMachineDraft` in `lib/outbound/queue.ts` | certification time (drafts are composed from the certified facts) |
| approved | Ovie Outbound approve, exact copy revision | ledger `outbound:copy:*` yes row |
| sent | cold provider adapter (not built; closed) | `leads.first_contacted_at` |
| opened, replied | provider webhooks (`/api/webhooks/instantly`) | `lead_funnel_events` |
| claimed, activated, paid | claim flow, product events, Stripe | `leads.signup_at`, events, `leads.paid_at` |

`summarizeFunnels` reports reach, conversion and p50/p95 dwell per stage and
segment, and names the bottleneck stage. Summer reads it from the internal route.

## Hard rules in code

- Dogfood gate (2026-10-29): no draft reaches Tim and nothing sends unless the
  prospect's built artifact and the onboarding flow they land in both passed
  the LLM dogfood judge (vision review against Tim's taste rubric and the Pen
  designs) within 14 days. `lib/outbound/cold/dogfood-gate.ts` holds the rule;
  `dogfood-gate.server.ts` is the judge's binding point. Until the judge
  publishes verdicts the gate is shut: certified rows show "Awaiting dogfood
  judge" with no draft, approval is refused (`dogfood_not_passed`), and the
  controller reports `onboarding_not_dogfood_certified`. Tim judged the current
  onboarding flow behind design, so outreach waits for it.

- Channels: cold email in Tim's voice from the cold domain, and Jovie brand or
  product accounts. Tim's personal Instagram, TikTok and YouTube are lifestyle
  only and are never an outreach channel: no pitches, CTAs or posts from them
  (gbrain `decisions/company/tim-personal-channels-lifestyle-only-2026-10-29`).
  The legacy `dm` channel may only send from a Jovie brand account.
- Cold mail never uses `jov.ie` or a subdomain, and never Resend. The stream
  registry owns the cold domain (`EMAIL_STREAM_COLD_DOMAIN`, #23585).
- `checkColdCompliance` fails closed on: missing postal address
  (`OUTREACH_MAILING_ADDRESS`, JOV-9648), missing one-click unsubscribe, a from
  address off the cold domain, a from name that is not a person, a deceptive
  subject, or a recipient suppressed on any stream.
- No send without an approval record: a founder approval of the exact copy
  revision, or an `auto` verdict for the segment (`hasApprovalRecord`).
- `planColdSends` returns zero sends while any gate is closed. Today every gate
  is closed, and `denyAudienceEffect` still refuses audience delivery in code.
- Drafts use only facts from the built artifact (release title and date,
  release count, confirmed streaming services). Proof stats, when used, come
  from the proof-stat registry (#23666), never from a model.
- The learning set stores drafts with the name and claim link replaced by
  placeholders.

## Learning and the auto-approve gate

- Edit pairs: `outbound:edit:<leadId>` rows in `contact_evidence_reviews`
  (before, after, categories, word-level edit distance). Rejects are stored
  with their reason chip and count as a full change.
- Metrics per segment, newest template only, rolling 100: % approved unchanged,
  p50/p95 edit distance, reject reasons, edit categories.
- Style guide: phrases Tim removes or adds in at least 3 edits. Few-shot set:
  newest edited approvals, one per edit category, never from the 20% held-out
  leads. `evaluateDrafter` scores any new drafter on the held-out leads before it
  replaces the current one.
- Auto when: at least 50 reviews on the current template, p95 edit distance 0,
  bounce under 2%, complaints under 0.1%, kill switch off. Back to review on any
  breach, a new template or segment, or Tim's switch.

## Controller

- Warmup 14 days with no cold sends, then 5, 10, 15, 20 per inbox per day.
  One step up per healthy 7-day window (30+ sends, bounce under 2%, complaints
  under 0.1%, reply rate at least 80% of baseline).
- Pause an inbox at 3% bounce or any complaint at the 0.1% line; pause a domain
  on a pooled breach. Each pause is a Summer incident.
- Domain ceiling 60 per day. The Ovie dial (`lead_pipeline_settings.daily_send_cap`)
  is a ceiling, never a floor.

## Recommended setup (needs Tim's approval; nothing bought)

Aligned with the spend cards in [email-sending-streams.md](email-sending-streams.md).

| Item | Choice | Cost |
|---|---|---|
| Domains | `meetjovie.com` (owned; confirm no human mail first) plus one new lookalike such as `getjovie.com` or `jovie.co` | about $12 to $15 per year for the new one |
| Inboxes | 5 Google Workspace Business Starter seats (3 on the first domain, 2 on the second), named people only | about $7 to $8.40 per seat per month, $35 to $42 per month |
| Sending and warmup | Instantly Growth (warmup included, unlimited inboxes, already the planned provider: JOV-7859, JOV-8747) | about $47 per month monthly, $37 annual |
| Total | | about $85 to $90 per month |

Capacity at full ramp: 5 inboxes x 20 = 100 per day, held to 60 per domain,
about 2,000 per month. Warmup takes 2 to 3 weeks after the inboxes exist, so the
approval is on the critical path for the first send.

ToS fit: Instantly and Smartlead permit cold outreach that follows CAN-SPAM.
Google Workspace forbids spam and unlawful bulk mail; low-volume, personal,
CAN-SPAM-compliant 1:1 email is common practice on it, but suspension is a real
risk at volume, which is why volume is capped per inbox and domains are
sacrificial. Resend forbids cold mail and is never used for it.

## Scaling plan

Base: 2 domains, 5 inboxes, about 100 sends a day at full ramp.

1. First, earn the right to scale: auto-approve per segment once the gate
   passes, so Tim's review time stays flat while volume grows.
2. 10x (about 1,000 a day): 10 to 12 domains and 50 inboxes as a rotating pool;
   the controller ramps each one unchanged and retires any that breach.
3. At 10x the cost moves to build and certify, so every failure there is fixed
   in the product first; each fix raises the share of prospects that certify.
4. 100x (about 10,000 a day) is past what cold inboxes should carry. Growth
   there comes from the artifact itself: claimed pages, smart links and agent
   distribution bring the next artists, with cold email as the seed.
5. Summer moves volume to the segment with the best measured reply-to-paid
   conversion each week, and every signup goes through the waitlist gate.
