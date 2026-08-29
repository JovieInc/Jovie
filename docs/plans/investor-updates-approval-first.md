# Approval-First Investor Updates

Status: implementation plan
Date: 2026-08-29
Owner: founder/admin surface

## Bottleneck And Success Metric

The bottleneck is founder attention spent reconstructing a trustworthy monthly
update from scattered signals, while one unsupported claim or accidental send can
destroy trust. Current Jovie source has an investor pipeline, source records,
approval cards, exact-revision approvals, and email receipt primitives, but no
monthly investor-update workflow that composes them.

This slice succeeds when:

- every candidate win or ask carries a metric, unit, measurement window, source
  reference, confidence, caveats, and proposed claim;
- every candidate has an explicit Share, Exclude, or Edit decision before final
  approval;
- final approval snapshots exact rendered copy, all four recipient roles, explicit
  inclusion or exclusion, and an exact aggregate recipient count;
- the product contains no send action and calls no email provider;
- provider acceptance cannot be recorded outside the approval window, and later
  delivery observations require a prior trusted provider-acceptance receipt;
- open/click tracking remains off because no consent-aware investor-update tracking
  substrate is approved.

Expected improvement is a single compact decision queue instead of a monthly
reconstruction exercise. This task has no measured founder-time baseline, so that is
an acceptance target, not a quantified performance claim.

## Adopt-First Assessment

Public pages were observed through Playwright on 2026-08-29. Product availability
and vendor claims remain subject to vendor due diligence; a working marketing page is
not an adoption receipt.

| Option | Current public evidence | License / operating model | Privacy and integration boundary | Decision |
| --- | --- | --- | --- | --- |
| [Cabal](https://getcabal.com/) | Active 2026 site, company updates, asks, mail merge, Gmail/Outlook integration, free and paid Mail plans, SOC 2 claim | Proprietary SaaS; terms grant account access only and retain Cabal IP | Processes Gmail, contacts, recipient workflows, message state, and optional open/click tracking; AI/tool integrations can process customer content | Do not adopt for this slice. Status is sufficiently live to evaluate, but product fit, data processing, portability, and sending authority remain unverified. |
| [Visible](https://visible.vc/investor-updates/) | Active founder product with update editor, recipients, preview/send, KPI charts, templates, Slack/PDF/link sharing, and engagement analytics | Proprietary SaaS, $0 to $199/month public founder tiers | Designed to host recipient lists, update content, KPI integrations, and engagement analytics | Do not adopt for this slice. It is the closest finished sender, but would move Jovie evidence and recipient state into a second system and does not expose Jovie's approval invariants. |
| [Foundersuite](https://foundersuite.com/features/investor_update_software) | Active 2026 site with investor CRM/database, segmented updates, publish/send, templates, and view-duration tracking | Proprietary SaaS with free and paid plans | Couples update composition to its contact database, CRM, sends, and recipient tracking | Do not adopt for this slice. It expands the contact and tracking boundary beyond the authority granted here. |
| Public open-source search | GitHub repository search for `"investor updates"` returned templates, demos, skills, and low-signal automation repositories; no maintained product matched the approval, provenance, segmentation, and receipt requirements | Mixed or absent licenses; no credible maintained substrate identified | Unclear privacy and operating ownership | Do not fork. Revisit only if a maintained project exposes explicit provenance, approval snapshots, privacy controls, and a portable data model. |
| Existing Jovie product | `memory_source_records`, `suggested_actions`, Taste Inbox/Ovie card language, admin investor routes, creator revision approvals, and email receipt/event patterns | Owned TypeScript/PostgreSQL/Next.js system | Keeps source facts and founder decisions inside the existing Jovie trust boundary | Compose and extend. |

Decision: **compose/extend** the existing Jovie web application. No parallel service,
mailbox, CRM, sender, or tracking system is introduced.

Revisit trigger: evaluate a vendor or open-source substrate only when Jovie needs a
real sending provider and the founder has separately authorized recipient import,
privacy terms, consent handling, portability, and a production send path.

## Existing Leverage And New Boundary

Reuse:

- `memory_source_records` as the required provenance anchor for candidate claims;
- admin investor access and `/app/ov/investors` as the operator boundary;
- Taste Inbox's compact card grammar, without reusing `suggested_actions` execution
  semantics;
- exact-copy hashing and append-only approval concepts already used by creator
  documents;
- provider-independent delivery receipt vocabulary from existing email systems.

A bounded `lib/investors/updates` domain/store is necessary because
`suggested_actions` means approval of a side effect and may enqueue execution. An
investor-update Share decision must compose a draft only. It must never imply or
trigger sending.

## Smallest Coherent Vertical Slice

1. Add source-backed monthly drafts, candidates, append-only candidate decisions,
   exact final approvals, delivery events, and generic stakeholder records to the
   existing investor schema.
2. Add a pure approval kernel that:
   - validates exact metric/provenance/window fields;
   - ranks candidates by relevance;
   - composes only Share/Edit decisions;
   - requires all candidates and all recipient roles to be decided;
   - fingerprints all candidates, latest decision records, exact rendered copy,
     ordered segments/count, and tracking settings;
   - binds approval to a monotonic draft revision held under a database share
     lock, so a concurrent candidate/decision mutation fails approval closed;
   - rejects tracking flags and exposes no send transition;
   - keeps receipt writes server-only until a trusted provider adapter can attest
     an opaque event reference and server-observed time.
3. Add one admin API endpoint for readback and two explicit mutations: candidate
   decision and final approval. The strict action union intentionally contains no
   receipt, contact, tracking, or send action.
4. Add `/app/ov/investors/updates`, a compact review surface with candidate cards,
   a living draft preview, explicit role selectors/counts, and a locked approved
   state. No contacts are displayed or accepted.

## Data Boundaries

- Recipient roles are `investor`, `advisor`, `founder_self`, and `other_explicit`.
- This slice stores only role inclusion and aggregate counts in an approval
  snapshot. It has no recipient address field and no contact-import route.
- Stakeholder records support a reference label, role, and optional contribution
  observation. Contribution knowledge is `known`, `estimated`, or `unknown`.
  Known/estimated amounts require a source record and as-of time. Unknown amounts
  remain null. There are no ownership, dilution, cap-table, or legal fields.
- Candidate and ask records require a durable source record. A URL or prose note
  alone is not sufficient provenance.
- Candidate facts, founder decisions, final approvals, and delivery observations
  are append-only at the database boundary. Approval inserts also verify that the
  supplied decision IDs are the current decision for every candidate in the
  locked draft revision.
- Tracking flags default to false and are rejected while the compliant-substrate
  capability constant is false.
- Delivery events are server-only observations with opaque references. They do not
  claim provider delivery beyond the recorded event type and count, and there is no
  public/admin receipt mutation before a trusted provider adapter exists.

## State And Interaction Matrix

| State | Founder sees | Allowed action | Layout rule |
| --- | --- | --- | --- |
| Loading | Stable draft/card skeleton | None | Reserve the populated geometry |
| No draft | One quiet empty state | None | No fake candidates or sample metrics |
| Pending candidates | Ranked win/ask cards and provenance | Share, Exclude, Edit | Actions stay in a fixed footer row |
| Partial decisions | Updated compact draft plus remaining count | Decide remaining cards | Preview slot remains stable |
| Ready for final approval | Exact copy, four role rows, exact count | Manual final approval | Approval stays disabled until complete |
| Approved | Immutable fingerprint, segment snapshot, count, expiry | Start a new revision | No Send button is rendered |
| Receipt recorded | Provider-independent event receipt | None in this slice | Receipt appends below approval without moving controls |
| Mutation error | Inline error in reserved status slot | Retry the same explicit mutation | No optimistic success claim |
| Permission denied | Existing admin boundary | None | Existing shell redirect/API 401/403 |

Mobile uses the same single-column order: remaining decisions, candidates, draft,
segments, approval. Long claims and caveats wrap; no horizontal tables or nested
card stacks are introduced.

## Verification Plan

Meaningful tests must cover:

- candidate validation, rank ordering, and Share/Exclude/Edit composition;
- incomplete-decision rejection and edited-claim behavior;
- explicit inclusion/exclusion of every recipient role and exact count agreement;
- tracking-off enforcement and absence of a send action;
- exact-copy/hash mismatch and approval expiry;
- concurrent draft mutation, final revision readback, and immutable approval-ledger
  behavior;
- provider acceptance timing, future-event rejection, and downstream receipt chain;
- known/estimated/unknown contribution validation;
- API admin gating and mutation input validation;
- UI disabled/ready/approved states and self-copy selection.

Run focused Vitest coverage, Biome, web typecheck, migration validation/check, and a
rendered component or route proof. Preserve the repository's current CI gates.

## Explicit Non-Goals

No email send, mailbox/domain setup, real recipient import, contact lookup, contact
display, production data mutation, fundraising/accounting claim, cap table, legal
advice, open/click tracking, or forwarding/referral attribution is part of this
slice. These are outside the granted authority, not implied follow-up work.
