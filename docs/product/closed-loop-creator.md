---
title: Closed-Loop Creator — Canonical Product Contract
status: thesis-and-architecture
owner: Product
source_of_truth: This document is the agent-facing contract for the Closed-Loop Creator direction.
evidence_boundary: Proposed architecture and roadmap; do not represent planned behavior as shipped or proven.
---

# Closed-Loop Creator

## Purpose and evidence boundary

The Closed-Loop Creator is a product direction for operating a creator's business
across owned assets, audience signals, opportunities, approved tasks, execution, and
outcomes. This document is canonical for the vocabulary and boundaries below. It is
not evidence that every component exists, that automation is enabled, or that Jovie
has broad creator PMF. Agents must label each statement as **shipped**, **manual**,
**planned**, **proxy**, or **unknown** when writing product or investor copy.

## Canonical architecture

```text
owned assets + external signals
  -> normalized asset graph and provenance
  -> observable opportunity / task candidates
  -> ROI-ranked task contract
  -> prepare -> human approval boundary
  -> bounded execution with audit/idempotency
  -> downstream outcome events
  -> attribution + operator feedback
  -> updated ranking and next task
```

### Owned-asset graph

The graph may represent creator profiles, smart links, releases, campaigns, fan
identifiers, offers, merch, tickets, tour dates, contacts, team roles, deal terms,
rate-card floors, and creative assets. Every edge needs a source, timestamp, scope,
and confidence. Ownership and access are distinct: an external platform may be
connected without becoming an owned Jovie asset.

### Observability spine

Keep these states separate and queryable:

- source signal and provenance;
- candidate task and ranking explanation;
- preparation/draft state;
- approval decision and approver;
- execution request, idempotency key, and result;
- downstream outcome and attribution window;
- override, failure, cost, and human feedback.

Never infer shipped execution from a generated draft. Never call a modeled value
settled revenue. If temporal linkage or a baseline is missing, classify the outcome
as `unknown` or `proxy`.

## Privacy and externalization rules

1. Private contacts, fan identifiers, unpublished creative, negotiations, and
   creator-specific rates remain scoped to that creator and authorized collaborators.
2. Externalize the minimum payload needed for an approved task, only to the named
   destination and for the stated purpose.
3. Require creator/team consent before sending messages, publishing content, sharing
   identifiers, or using rights-sensitive assets.
4. Keep cross-creator learning de-identified and aggregate. Do not train or expose
   one creator's contacts, rates, messages, or audience records to another.
5. Show what leaves Jovie, where it goes, why it is needed, retention expectations,
   and how access can be revoked.
6. Do not use private dogfood observations as public traction or customer proof.

## Authenticated workspace scope

Presence is the recurring artist workspace for DSP profiles, social networks,
public pages, search rank, answer-engine visibility, audience quality, and
monitoring signals. Its canonical route is `/app/profiles`; `/app/presence` remains
a legacy alias. Account-authorized integrations such as Gmail and Google Calendar
belong in Settings at `/app/settings/connectors`, labeled **Connections**. Shared
provider plumbing does not make an OAuth grant an artist-presence activity.

Contacts remains a global action and surface in every account. For a single
artist, Library, Calendar, and Presence stay flat in the sidebar. For multiple
artists, only those three artist-owned destinations sit under the selected
artist's collapsible group. Relationship work must not look owned by one artist.

Public marketing may interlink an artist-profile outcome to a dedicated feature
page only when the relationship is material and supportable. Artist Profiles may
link to Fan Notifications and Instant Merch because both turn profile discovery
into a specific next action. Descriptive search/AEO and audience-quality claims
remain unlinked until they have dedicated canonical pages.

### Manager and agent representation

**Ship now:** keep Contacts global and add no graph or roster architecture in this
slice. The smallest follow-on UI is a **Represents** section in the detail view of
contacts whose role is Manager or Agent. A user can search for an existing Jovie
artist or enter an external artist name with an optional canonical URL. A contact
may represent more than one artist, and an artist may have more than one
representative.

Each entry begins as a private user assertion, not a Jovie fact or endorsement.
The smallest coherent record is:

- contact ID;
- Jovie artist ID when matched, otherwise external artist name and optional URL;
- asserted-by user ID, source (`user`), creation/update timestamps, and optional
  private note;
- separate verification state (`unverified`, `corroborated`, `verified`, or
  `disputed`) with provenance references and verification timestamp.

Assertions are visible only to the account or workspace that created them by
default. Jovie must not publish them, notify the named contact or artist, imply
consent, use private notes for model training, or authorize outreach from them.
Recommendations may use an unverified assertion only as clearly labeled context;
collaboration scoring, industry-roster publication, and identity claims require
corroboration plus the applicable consent.

Verification progresses without overwriting provenance: user assertion, then
corroboration from a supplied canonical URL or matching public professional source,
then explicit confirmation from the contact or artist where the use case requires
it. Conflicting evidence marks the entry disputed rather than silently deleting
history.

**Re-evaluate when:** at least 25 accounts have each entered two or more
representation assertions and at least 30% can be corroborated without unsolicited
outreach. **Then:** consider a normalized relationship service, bounded verification
jobs, and an opt-in industry roster view. Until that trigger, the contact-detail
section and its provenance contract are sufficient.

This slice does not add providers, Gmail behavior, rank-provider infrastructure,
automatic SEO/AEO remediation, representation storage, verification jobs, or an
industry roster. Presence summarizes available signals; measured rank expansion
and automated boosting remain separately gated capabilities.

## Task contract

Every task candidate must be representable as a bounded record with at least:

```yaml
id: stable-task-id
creator_scope: creator-or-workspace-scope
kind: stable-task-kind
objective: measurable desired outcome
source_evidence: [{source, observed_at, excerpt_or_reference}]
rank:
  expected_value: measured-or-labeled-proxy
  confidence: low|medium|high
  urgency: low|medium|high
effort: estimate-or-unknown
draft: payload-or-checklist
approval:
  required: true|false
  boundary: internal|external-communication|pricing|rights|public-change
execution:
  mode: manual|approved-automation
  idempotency_key: stable-key-or-null
outcome:
  status: unknown|success|failure|proxy
  attribution_window: explicit-window-or-null
```

A task is not complete until its execution and outcome state are recorded. Ranking
must be explainable in terms of expected value, confidence, urgency, effort, and
reversibility. A task with high consequence and low confidence defaults to
prepare-only or human approval.

## Approval boundaries

Human approval is mandatory before:

- any external communication or public publication;
- accepting, negotiating, or committing to a deal;
- changing a creator's rate-card floor or approving a deviation from it;
- sending fan identifiers or sensitive data to an external system;
- using unpublished or rights-sensitive creative;
- actions that materially spend money, change access, or alter a public presence.

The approver may edit, reject, or defer. Approval must be bound to the exact draft,
recipient/destination, scope, and relevant data. Execution must fail closed when the
approved payload has changed, the approval is stale, or the destination is outside
scope.

Low-risk, reversible internal steps may become automated only after repeated
successful manual/approved runs, explicit policy, bounded budgets, idempotency, and
a rollback path. Model confidence alone is never an approval substitute.

## Manual-to-automated maturity

1. **Observe** — capture source facts and provenance.
2. **Suggest** — rank a task with evidence and uncertainty.
3. **Prepare** — draft without sending or publishing.
4. **Approve** — creator/team accepts, edits, rejects, or defers.
5. **Execute** — run the approved task and record the result.
6. **Automate narrowly** — only a proven, reversible class within policy.
7. **Re-evaluate** — measure outcomes, overrides, failures, and time saved.

Agents must not skip a maturity stage in copy, implementation plans, or demos.

## Creator Deal Desk

Deal tasks may include intake, deliverable/date extraction, rate-card comparison,
response preparation, and follow-up reminders. Rate-card floors are creator-owned
guardrails, not automatically binding rejection rules. A below-floor exception must
show the tradeoff and require explicit approval. No agent may accept or negotiate a
deal externally.

## Roadmap

- **P0 — observable substrate:** canonical asset/task vocabulary, provenance,
  manual task ledger, explicit unknown/proxy labels, and approval audit trail.
- **P1 — operator loop:** owned-asset graph views, ROI-ranked suggestions, draft
  preparation, creator/team approvals, outcome capture, and Tim dogfood.
- **P2 — repeatable workflows:** Deal Desk, rate-card floors, release/tour/offer
  playbooks, bounded integrations, and attribution windows with baselines.
- **P3 — narrow automation:** automate only task classes with repeated evidence,
  reliable execution, clear rollback, privacy policy, and creator opt-in.
- **P4 — learning system:** aggregate, de-identified patterns improve ranking;
  independent creator cohorts validate time-to-value, retention, and attributable
  outcomes.

These are sequencing hypotheses, not committed delivery dates.

## PMF and dogfood loop

Tim dogfood is an internal discovery loop: use real creator work, record missing
context and approval friction, turn observations into falsifiable hypotheses, and
validate them with independent creators. It is not broad traction. The evidence
ladder is: repeated approved use, reliable execution, measurable time or outcome
improvement, then attributable cohort evidence with a stated baseline.

## Unknowns and decision gates

- Which asset graph entities produce the highest repeatable creator value?
- Which tasks are frequent, reversible, and valuable enough to automate?
- What minimum provenance is needed for defensible attribution?
- Which integrations can honor consent, deletion, and scope reliably?
- What does a creator consider a meaningful time-to-value?
- Which Deal Desk exceptions are common enough to model without replacing judgment?
- What independent cohort size and baseline are needed before quoting lift?

Do not resolve these unknowns by inventing metrics, customer counts, automation
coverage, or revenue claims. Add evidence, an owner, and a falsifiable acceptance
condition before promoting a hypothesis to product truth.
