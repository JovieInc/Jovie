# LYB activation and retention contract

**Contract version:** `lyb-activation-retention:v1`

**Source issue:** JOV-6069

**Owner:** LYB product (definition); JOV-6057 (analytics reconciliation)

**Last verified:** 2026-09-27

**Dependencies:** JOV-6066 / PR #18891 (offer) and JOV-6067 / PR #18892
(MVP cut line), both open and unmerged when this contract was written

**Evidence note:** GBrain keyword and semantic lookup returned no matching pages
(`gbrain-no-results`). Linear and the dependency PRs are the source evidence.

## Decision

LYB has one activation event:

> **The user's first individualized week-one coaching directive is persisted and
> delivered after the coach has used that user's completed baseline.**

The event name is `lyb.coaching_directive_delivered`. A directive qualifies only
when its durable receipt references:

- the user and paid LYB account;
- the completed onboarding/baseline record, including goal, training history,
  available body-composition evidence, and relevant constraints;
- the persisted directive shown to the user; and
- server-observed `occurred_at`, contract version, app version, and an
  idempotency key.

A page view, chat open, message send, button click, generated-but-not-persisted
answer, generic template, or client-only analytics event does not activate a
user. Delivery may be founder-assisted at launch, but the qualifying directive
and its provenance must still be persisted.

This is the smallest real value promised by the JOV-6066 offer and supported by
the JOV-6067 MVP: an opinionated coach uses the user's body and training context
to tell them what to do next. It does not create a second activation stream.

**Ship now:** this single activation definition. **Re-evaluate when:** paid-user
interviews show that receiving the directive does not predict completing a first
weekly check-in. **Then:** change this contract in a versioned successor; never
silently reinterpret historical `v1` receipts.

## First-session path to value

The JOV-6071 launch surface must implement one path, with no competing product
route:

1. Landing-page visit carries an anonymous `visit_id` and acquisition source to
   the paid/onboarding handoff.
2. Signup creates the durable LYB user and stitches the `visit_id` to `user_id`.
3. Payment creates a provider-correlated paid entitlement. Payment may occur
   before or during onboarding, but it is not activation.
4. Onboarding captures the minimum usable baseline: outcome/goal, training
   history, body-composition evidence available now, and safety-relevant
   constraints. Missing DEXA must not strand a user when the approved equivalent
   body-comp input is available under the MVP cut line.
5. The coach persists and delivers one opinionated week-one directive based on
   that baseline. This emits `lyb.coaching_directive_delivered` and ends the
   first-value clock.
6. The return surface shows the directive, the next check-in due date, and the
   evidence the next adjustment will use.

Primary **time to first value (TTFV)** is
`coaching_directive_delivered.occurred_at - signup.occurred_at`. Also retain
visit-to-value and paid-to-value durations for diagnosing acquisition and paid
onboarding separately. Report median, p75, and the count still unactivated;
never drop incomplete users from the denominator.

## One recurring loop

The launch retention loop is a **weekly check-in to adjusted directive**:

1. The user logs adherence, completed training, recovery, current body metric,
   and a progress photo when due and consented.
2. The coach compares that check-in with the prior directive and progress
   history.
3. The coach persists and delivers one training/nutrition/recovery adjustment,
   including what changed and why.
4. The adjusted directive becomes the next week's return surface and sets the
   next due date.

The repeat-value event is `lyb.weekly_adjustment_delivered`. It qualifies only
when a durable receipt references the qualifying check-in, prior directive,
persisted adjustment, delivery time, contract/app versions, and idempotency key.
Opening the app or submitting a check-in alone is not retention.

A user is initially retained when the first qualifying weekly adjustment is
delivered 5–10 days after activation. Current weekly retention thereafter means
the latest qualifying adjustment was delivered no more than 10 days ago. This
window permits a weekly habit without turning a late check-in into false churn.

## Funnel and durable evidence

JOV-6057 owns the physical analytics registry and reconciliation. LYB must map
these logical facts to durable server, database, or billing-provider authority;
client analytics can corroborate but cannot be the authority.

| State | Logical event / durable fact | Minimum identity and evidence |
|---|---|---|
| Visit | `lyb.launch_visited` | `visit_id`, occurred time, landing version, acquisition source; client loss is reported as unknown, not zero |
| Signup | `lyb.signup_completed` | durable `user_id`, stitched `visit_id` when available, server time |
| Onboarding | `lyb.baseline_completed` | `user_id`, baseline record ID/version, server time; never raw health values in the analytics payload |
| Activation | `lyb.coaching_directive_delivered` | qualifying directive receipt defined above |
| Paid | `lyb.paid_entitlement_active` | `user_id`, provider/customer/subscription references, product/price, provider-effective time |
| Retained | `lyb.weekly_adjustment_delivered` | qualifying adjustment receipt defined above |

Every event needs a stable event ID/idempotency key, `user_id` once known,
server `occurred_at`, contract version, producer/app version, and source
authority. Identity stitching must preserve the anonymous visit rather than
rewriting its time. Retries dedupe by event ID; late events retain event time and
record ingestion time. Refund, cancellation, expiration, and payment failure
come from provider-correlated entitlement facts, not UI state.

The daily funnel uses one launch-customer row per durable LYB user and exposes
the first timestamp for every reached state plus the latest qualifying repeat
event. Counts must reconcile to those rows; paid counts reconcile to provider
receipts. Unknown or stale evidence is displayed as unknown and cannot drive an
automatic decision.

## Customer classification

Classification is deterministic and mutually exclusive. Evaluate from top to
bottom; the first match wins.

| Classification | Evidence |
|---|---|
| **Churned** | Paid entitlement has ended, been refunded, or been canceled effective immediately, according to provider-correlated evidence. A scheduled period-end cancellation remains churn-risk until entitlement ends. |
| **Churn-risk** | Entitlement is active and any recovery threshold below is breached, including activation overdue, check-in overdue, adjustment-delivery overdue, scheduled cancellation, or payment failure/grace period. |
| **Retained** | Activation exists and a qualifying weekly adjustment was delivered in the current 10-day window. |
| **Activated** | A qualifying activation exists, but no qualifying weekly adjustment has yet been delivered in the current window. |
| **Not activated** | Signup exists and no qualifying activation exists. Pre-signup visitors remain funnel prospects, not launch customers. |

This precedence ensures every launch customer has one current label and the
underlying timestamps explain it. It does not conflate payment with activation
or cancellation intent with completed churn.

## Early signals and recovery

The founder may execute launch interventions manually, but the trigger, action,
outcome, and reason must be recorded against the customer row.

| Signal | Threshold | Recovery intervention |
|---|---|---|
| Signup, onboarding not started | 2 hours | Send one personal setup prompt with a direct resume link; offer assisted onboarding. |
| Onboarding started, no activation | 24 hours | Review the exact blocked step; founder assists completion or supplies a manual directive through the same persisted receipt path. |
| Activated, weekly check-in not submitted | Start of day 7 | Remind with the promised value: the check-in is what changes next week's plan; offer a five-minute assisted check-in. |
| Check-in submitted, no adjustment delivered | 12 hours | Raise an operational delivery blocker and deliver a reviewed manual adjustment through the same durable path. |
| No first retained event | End of day 10 after activation | Mark churn-risk, ask one concise fail-reason question, and schedule a founder recovery review. |
| Payment failure or scheduled cancellation | Immediately on provider receipt | Explain access timing, provide the provider-managed recovery/cancel path, and ask for the reason without obstructing cancellation. |
| Two consecutive missed weekly loops | At second missed due date | Stop generic reminders; request a short recovery interview and offer to reset the directive to a smaller next action. |

Health or safety concerns never receive an automated persuasion sequence. Route
them through the JOV-6073 trust boundary and preserve the user's ability to stop.

## Qualitative fail reasons

Record one primary code, optional secondary codes, a short verbatim note, the
funnel state, who captured it, and capture time. Allowed primary codes are:

- `setup_friction`
- `missing_or_unusable_baseline`
- `directive_not_personal`
- `directive_not_actionable`
- `trust_or_privacy`
- `health_or_safety_boundary`
- `price_or_payment`
- `timing_or_capacity`
- `outcome_mismatch`
- `missing_product_capability`
- `technical_failure`
- `no_response`
- `other` (note required)

Do not infer a reason from inactivity. `no_response` is the truthful state until
the user supplies evidence.

## Automatic constraint blocker

The JOV-6075 daily scoreboard must evaluate the launch-customer rows after
reconciliation and upsert, rather than duplicate, one open blocker under the
JOV-6065 governor when any funnel SLA is breached:

- **Activation blocker:** at least one user is more than 24 hours past baseline
  completion without a qualifying activation receipt.
- **Retention blocker:** at least one activated user is past day 10 without a
  qualifying weekly adjustment, or a submitted check-in has waited 12 hours for
  an adjustment.
- **Evidence blocker:** the relevant durable source is stale beyond its JOV-6057
  freshness SLA, cannot reconcile, or has unknown provenance.

If more than one trigger is open, the earliest blocked funnel stage is the
current constraint; evidence failure takes precedence because the system cannot
truthfully rank product constraints without it. The blocker fingerprint is
`lyb:<contract-version>:<constraint>:<UTC-date>` and its receipt includes
affected user count, oldest breach age, numerator/denominator, source freshness,
and links to redacted customer evidence. Resolve it only after a reconciled run
shows zero breached users; do not resolve it from a client-event decline.

## Success and ownership

- **Bottleneck:** paid users may receive no measurable first or repeat value.
- **Success metric:** every launch customer has reconciled state evidence;
  signup-to-activation TTFV falls while the share receiving a first weekly
  adjustment rises.
- **Smallest change:** one activation receipt, one weekly repeat receipt, and
  one classification/recovery contract; no second analytics or product stream.
- **Verification:** JOV-6057 certifies event authority/reconciliation, JOV-6071
  proves the first-session path, JOV-6074 captures paid-customer outcomes, and
  JOV-6075 proves automatic blocker creation.
- **Rollback:** stop automated interventions and blocker mutations if evidence
  qualification fails; retain immutable receipts and use manual review. Never
  delete or reinterpret historical contract-version evidence.
