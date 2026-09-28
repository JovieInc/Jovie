# Certification v2: customer certification

Status: design spec (no code in this PR)
Owner: Tim White (taste, per-customer approval), Summer (operation)
Date: 2026-09-26
Part of: [CERTIFICATION_V2_DOGFOOD.md](CERTIFICATION_V2_DOGFOOD.md)
Tracking: JOV-6638 (epic); customer children JOV-6649 to JOV-6658

Product certification asks "does this change work?" Customer certification asks
"does Jovie work for this person, today, with what we have shipped?" It uses
the same kernel, the same receipts, and the same Ovie surfaces. Building the
customer's profile is the test. When it breaks, we fix the product and try again.

## 1. Founder flow this spec is held to

1. Sourcing: our agents, third-party agents, bulk loads, and organic signups
   all enter one pipeline.
2. Pre-scrape public profiles to qualify, then build a real Jovie profile.
3. Rank by predicted willingness and ability to pay, and by fit with shipped
   capability. Fit moves forward. No fit is held, not discarded.
4. Machine certification means building and inspecting the profile. If
   something about this customer breaks the product, fix the product, ship,
   re-check. That loop is the machine certification.
5. Machine-certified prospects appear in Ovie as a certification table, with
   inbox cards as a view of it. Tim approves each one.
6. Machine plus human certified: the system does the outreach. After signup the
   customer is certified for that capability.
7. A new capability re-runs ranking over existing customers to choose who gets it.
8. Organic signups: fit goes to the waitlist and leaves it as soon as the
   profile machine-certifies. No fit waits until the capability exists.
9. While waitlisted, a curated Mom Test conversation per person learns what they
   want. Those signals steer roadmap priority. Nothing new is created on the
   roadmap without Tim's approval.
10. When the wanted capability ships and certifies, and Tim has certified the
    person, email them: "the feature you wanted just shipped, would love your
    thoughts". A conversation, not a pitch.

## 2. What already exists (extend, don't fork)

| Need | Existing code | Gap |
| --- | --- | --- |
| Lead lifecycle | `apps/web/lib/acquisition/kernel.ts` `ACQUISITION_STATES` and transition table | No capability-held reason; no customer-capability subject |
| Lead storage | `leads` table (`apps/web/lib/db/schema/leads.ts`), `fitScore`, `signalSnapshot` | Linktree-shaped (`linktree_handle` not null); sources only `google_cse`, `manual` |
| Manual and URL intake | `POST /api/admin/leads` (admin session), `apps/web/lib/leads/url-intake.ts` | No machine principal for agents; no third-party entry |
| Scrape and profile build | `apps/web/lib/leads/ingest-lead.ts`, `apps/web/lib/ingestion/flows/*` | None |
| Scoring | `apps/web/lib/leads/qualify.ts` (fit), `priority-score.ts` | No pay or capability-fit dimension |
| Machine checks | `machineCertifyPremadeProfile`, `machineCertifyYouTubeGrowth` in the acquisition kernel | Checks data completeness, not "did the built profile work" |
| Human decision | `AcquisitionCertificationStore` (`certification-store.ts`) on the v1 kernel with CAS and idempotent effect dispatch | Not projected in Ovie |
| Outreach | `apps/web/lib/leads/outreach-batch.ts` (email via Instantly), `experiment.finalDmSend: 'human'` | No per-type auto-send policy |
| Organic signup | `waitlist_entries` (`new` to `signed_up`), `/api/waitlist` | Not connected to lead ranking or machine certification |
| Mom Test | `apps/web/lib/acquisition/conversation-loop.ts` (`MOM_TEST_DIMENSIONS`, `isLeadingQuestion`, `qualificationReceipt`), `user_interviews` table, `/api/user-interviews` | Onboarding-only; not per waitlisted person; wants not extracted |
| Capability denominator | `docs/FEATURE_REGISTRY.md` stable feature IDs, read by `loadProfileCapabilitiesFromDisk` | No "shipped and certified" link to v2 product state |

## 3. Two subjects, one kernel

| Subject | Id | Kernel contract | Meaning |
| --- | --- | --- | --- |
| Prospect | `acquisition:premade-artist-profile:<leadId>:<runId>` (existing) | v1 today, v2 on opt-in | This person's built profile is correct and ready to show them |
| Customer capability | `customer-capability:<userId or leadId>:<featureId>` | v2 | This person is certified to use this capability |

`featureId` is a `docs/FEATURE_REGISTRY.md` stable ID. No new capability registry.

Evidence mapping for both subjects (same six taste tiers):

| Tier | Customer evidence |
| --- | --- |
| `canonical_source` | Built profile revision (the existing domain `revision`, never an evaluator SHA) |
| `invariant_evaluation` | Existing machine checks plus the capability's mission run against this profile |
| `tests_coverage` | Regression test for any product fix this customer triggered |
| `visual_proof` | Rendered profile, mobile and desktop |
| `canonical_references` | Rubric id and version (`certificationRubricId`) |
| `required_variants` | Light and dark, mobile and desktop |

Operational receipts: `runtime_dogfood` is the customer's own successful use after
signup (kind `human_signal`, section 4 of the dogfood spec), proven by the
capability mission passing on their account. That receipt moves a
customer-capability subject to `monitored`. It proves the capability works for
this customer. It is not a human certification: only Tim certifies (dogfood spec
section 7), and his per-prospect approval in section 4 is that certification.

## 4. Pipeline states

The acquisition state machine stays the lead lifecycle. Two changes only:

- Add `capability_held` as a reason on the existing `rebuild_waiting` state, with
  `heldFor: featureId[]`. No new state. A held lead re-enters `building` when a
  held-for capability reaches `monitored` in product certification.
- `machine_failed` gains a required classification: `product_defect` (Jovie
  broke on this customer) or `data_gap` (the person's public data is missing).
  A product defect files a Linear issue linked to the subject, moves the lead to
  `rebuild_waiting`, and the fix deploy triggers a rebuild. That is the fix loop.

```
discovered/inbound_waiting -> ingested -> qualified -> building
  -> machine_review -> human_review -> certified -> outreach_ready
  -> contacted -> claimed -> activated -> converted
machine_failed(product_defect) -> rebuild_waiting -> building   (fix loop)
qualified(no fit) -> rebuild_waiting(capability_held) -> building (capability shipped)
```

Organic signups keep `waitlist_entries` as their row. A waitlist entry creates or
links a lead with source `organic` and runs the same pipeline. Its waitlist
status follows the lead: fit and building means `waitlisted`; machine certified
means `approved` and an invite (section 7); no fit means `waitlisted` with
`heldFor`.

**Tim approves each prospect (flow step 5).** There is no silence promotion for
customers. The human window from the dogfood spec does not apply to a real
person being contacted.

**Organic exception (flow step 8).** An organic signup leaves the waitlist on
machine certification alone. They asked us. Tim still certifies the person
before the step 10 follow-up.

## 5. Sourcing

| Source | Entry | Principal |
| --- | --- | --- |
| Our agents | Server-side call into `lib/leads` intake (same code as `POST /api/admin/leads`) | Summer control principal |
| Third-party agents | New ingest endpoint | Scoped API key, rate-limited. Auth work: not agent-ready |
| Bulk | Existing admin intake with a batch upload | Admin session |
| Organic | `/api/waitlist` | The person |

All sources write a `leads` row with a `discovery_source` of `agent`,
`third_party_agent`, `bulk`, `organic`, `google_cse`, or `manual`. The leads row
drops the Linktree assumption: `linktree_handle` becomes nullable and
`source_platform`/`source_url` identify the lead. Dedupe stays on normalized URL.

## 6. Ranking

`rankCustomer` is a pure function. It returns `{ payScore, fitScore, rank, heldFor }`.

- **payScore (0 to 1): willingness and ability to pay.** Inputs in order of
  weight: demonstrated spend (`qualificationReceipt.willingnessToPay =
  demonstrated`, `hasPaidTier`, paid music tools in `musicToolsDetected`, ad
  pixels in `trackingPixelPlatforms`), then release cadence (`computePriorityScore`),
  then stated spend.
- **fitScore (0 to 1): fit with shipped capability.** The share of this
  person's needs that map to FEATURE_REGISTRY IDs whose product subject is
  `monitored`. Needs are inferred from the scrape (has Spotify, so smart links;
  has YouTube, so thumbnails) and later from the Mom Test.
- **Fit gate.** Every `must-sell` need must map to a monitored capability.
  Otherwise `heldFor` lists the missing IDs and the lead is held.
- **rank** = payScore x fitScore, among fit leads only. It orders the
  `building` queue and the Ovie table.

Ship now: fixed weights (demonstrated 1.0, cadence 0.5, stated 0.25).
Re-evaluate when: 50 prospects have reached `converted` or were explicitly lost.
Then: fit the weights to conversion and record the change as a rubric version.

## 7. Outbound policy

Every message to a person is an `outbound` Summer card that Tim approves, with
one exception: an outbound type can earn auto-send.

- **Type** = (experiment or purpose, channel, template version, featureId).
  Purposes: `prospect_outreach`, `waitlist_invite`, `mom_test_opener`,
  `feature_shipped_followup`. Any template edit makes a new type.
- **Auto-send is earned** when (a) the last 10 machine evaluations for the
  type, meaning the recipient's machine certification plus a message lint
  (voice, no leading questions, consent, contact budget), are 10 of 10 passed,
  and (b) Tim has approved one card of that type with an explicit "auto-send
  this type" action.
- **Auto-send is revoked** by any bounce, complaint, or unsubscribe above 2% over
  the trailing 50 sends, any Tim rejection of a message of that type, or a
  template change.
- Auto-send never skips Tim's per-person certification (section 4). It only
  removes the per-message card.
- The send path ships disabled. Enabling it is a separate post-landing authority action.

Type state lives in the existing certification CAS ledger (`ovie_operating_kv`).
No new table.

## 8. Mom Test conversation while waitlisted

- **Where it lives.** It reuses `conversation-loop.ts` for policy
  (`MOM_TEST_DIMENSIONS`, `isLeadingQuestion`, `qualificationReceipt`) and the
  `user_interviews` table for storage, with `source = 'waitlist_mom_test'` and
  `metadata.leadId`. No second conversation store.
- **Curated.** One script per held-for capability, in the pattern of
  `lib/interviews/onboarding-script.ts`, asking about past behavior and current
  spend, never about the future product. `isLeadingQuestion` is a hard lint on
  every agent turn.
- **Cadence.** The opener is outbound type `mom_test_opener`. Replies inside a
  thread the person started or answered are part of that conversation, and the
  type's auto-send status covers them. Budget: 1 unanswered message per 14 days.
- **Output.** Each finished interview yields a `qualificationReceipt` and zero or
  more capability wants (section 9). Objections are recorded as wants with
  `kind: objection`.

## 9. Signals to roadmap priority

One table, `capability_wants`:

| Field | Notes |
| --- | --- |
| `id` | uuid |
| `leadId` / `userId` | Who wants it |
| `featureId` | FEATURE_REGISTRY ID, or null if unmapped |
| `clusterKey` | Normalized label for unmapped wants |
| `kind` | `want`, `objection` |
| `evidence` | `demonstrated`, `stated`, `inferred` (from scrape) |
| `evidenceRef` | Thread turn id, never raw text |
| `payScore` | Snapshot at capture time |
| `createdAt`, `resolvedAt` | `resolvedAt` is set when the capability ships to them |

**Demand score** per featureId or clusterKey = sum over unresolved wants of
payScore x evidence weight (demonstrated 1.0, stated 0.5, inferred 0.25), with
a 90-day half-life.

**Allowed without Tim.** Summer may change the Linear priority of existing
issues and epics that implement a mapped featureId, in demand-score order.
She records the score and top evidence refs in a comment.

**Needs Tim.** A cluster with no mapped featureId becomes a `decision` Summer
card proposing a new capability. No new Linear issue, registry row, or epic is
created until Tim approves it.

## 10. When a capability ships

When a product subject for featureId F reaches `monitored`:

1. Re-rank existing customers and held leads for F. Customers ranked fit become
   candidates for F's rollout cohorts (dogfood spec section 6). The rollout
   ladder picks from this list first.
2. Leads held only for F re-enter `building`.
3. For each person with an unresolved want for F who is human-certified by Tim:
   queue a `feature_shipped_followup` card: "the feature you wanted just
   shipped, would love your thoughts". Their reply continues the Mom Test
   thread. Nothing in this message asks for payment.
4. On their first successful use, the `customer-capability:<id>:F` subject gets
   its `runtime_dogfood` receipt and reaches `monitored`. The want is resolved.

## 11. Ovie surface

`/api/ovie/certifications` gains a second scoped domain, `customers`, beside
`marketing_components`. It returns the same row shape (identity, state, digest,
blockers) plus rank, payScore, fitScore, and heldFor. The Ovie table is the
source view. Inbox cards are a projection of rows in `human_review`, one card per
prospect, with approve, reject, and request-rebuild actions that call the
existing `AcquisitionCertificationStore.decide` path.

## 12. Metrics (added to Summer's set)

| Metric | Direction |
| --- | --- |
| Product defects found by customer builds per week, and time to fix | Found up, fix time down |
| Machine-certify rate (built profiles passing first try) | Up |
| Tim prospect-approval latency and approvals per day | Down / up |
| Outreach reply rate and claim rate, per outbound type | Up |
| Auto-send types earned and revoked | More earned, fewer revoked |
| Waitlist time to release (fit) and held count per featureId | Down |
| Want-to-ship latency for top-demand features | Down |
| Follow-up reply rate on `feature_shipped_followup` | Up |
| Complaint and unsubscribe rate | At most 2% |

## 13. What is not changing

- The acquisition state machine stays the lead lifecycle; one reason and one
  classification are added, not states.
- `AcquisitionCertificationStore` keeps its CAS, idempotent effect dispatch, and
  server-side actor resolution.
- `finalDmSend: 'human'` stays the default for every experiment until a type
  earns auto-send under section 7.
- Leads, waitlist, and user interview tables stay the systems of record.
- No outbound message is sent without either a Tim-approved card or an earned
  auto-send type.
