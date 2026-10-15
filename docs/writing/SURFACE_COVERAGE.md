# Writing-surface coverage contract (JOV-6475)

Parent epic: JOV-3720 (voice engine — human-sounding, on-brand generated
content). This is the first executable slice: a coverage registry, not a new
service or fleet dispatch.

## Authority chain

Human-writing authority already exists. Do not copy word lists or rubrics into
skills, prompts, or templates — link here instead.

- Policy: [`canon/VOICE.md`](../../canon/VOICE.md) — voice goal, floor, and
  action-only agent communication rules.
- Shared vocabulary: [`docs/marketing/LANGUAGE.md`](../marketing/LANGUAGE.md)
  (JOV-6432).
- Executable rules: `packages/copy` (`@jovie/copy`); registers `jovie-marketing`,
  `jovie-product-ui`, `jovie-transactional`, `jovie-persona`, `founder-tim`,
  `customer-voice`.
- Meaning-first briefs, allowed claims, and taste decisions:
  `apps/web/data/marketing/copy.ts` (`MARKETING_COPY_SPEC_VERSION`).
- Coverage registry: `scripts/invariants/writing-surfaces-registry.json`,
  validated by `scripts/invariants/writing-surfaces.mjs` inside
  `scripts/invariants/validate.mjs`.
- Advisory review transport: `scripts/invariants/jev-gateway.mjs` (JOV-6465,
  artifact-bound, modality `text`). No alternative HTTP adapter.

## Review contract per surface

Each registry entry records: producer, repository, accountable existing owner,
audience, purpose, evidence sources, delivery adapter, policy version, review
mode, review point, and proof link. Unknown ownership stays explicit
(`owner: "unassigned"` plus an owner-routed `rollout` slice under JOV-3720);
unknown coverage stays `reviewMode: "uncovered"` — never blank.

Review modes: `gated` (review blocks delivery), `advisory` (review evidence is
collected, delivery proceeds), `manual` (human review only), `uncovered`.
Whole-message streaming to a reader before review is always
`post-generation-advisory`, never `gated`.

### Contract input

A review request carries: the exact candidate text, its intended job, the
allowed claims, the relevant evidence, and approved voice examples. Operator
context (who is running the review and why) stays separate from consumer
context (who reads the text and what they need); the two are never merged.

### Checks

Every surface declares six checks with an enforcement level
(`enforced`/`advisory`/`manual`/`none`) and a source:

- **truth** — every claim resolves to supplied evidence; missing evidence is
  `insufficient`, never a pass by default.
- **usefulness** — the text does its stated job for its stated audience.
- **repetition** — no redundant sections or duplicate lines.
- **puffery** — no hype, superlatives, or invented urgency.
- **instructionLeakage** — no prompt, template, or machinery residue.
- **voice** — register-appropriate house style.

### Preservation

Reviewers preserve deliberate fragments, domain terms, quotations, non-English
text, and justified uncertainty. Rewriting these away is a defect, not a win.

### Anti-goals

Review never classifies authorship (human vs model) and never treats detector
evasion as success. Missing answers must not become positive verdicts — that is
why the validator runs deliberate-red fixtures.

## Pilots

Two bounded pilots are nominated in the registry:

- **product-response**: the Jovie persona reply on the onboarding-mode chat
  path (`chat-persona` surface).
- **ops-report**: one bounded Summer/Symphony ops report (`agent-ops-reports`
  surface).

Both run through the advisory Jev transport; neither is production activation.

The already-landed ops pilot buffers its complete report. For condition-backed
pilot reports, the existing Python Linear adapter runs `ops-report.mjs --verify`
to recheck the exact message, audience, destination, current policy,
evidence digest/freshness and resolved
model before issue creation. Invalidated or unavailable review uses the existing
deterministic emergency notice. Approved factual templates are explicitly labeled
unreviewed; a model verdict grants no sending authority. Metadata receipts remain
in the existing doctor condition state without raw message text.

Ship now: this bounded ops adapter repair (JOV-3723). Re-evaluate when JOV-3722's
typed product revision outcome and JOV-6476 calibration are available. Then:
JOV-8428 owns product buffering and owner-routed connector/publisher slices;
JOV-6414 owns canary admission and rollback. The product stream remains advisory;
this repair does not activate semantic enforcement or establish deployed proof.

## Bypass candidates

Direct generation imports and connector sends that can deliver text without
the surface's review path are listed per surface as `bypassCandidates` — e.g.
`streamText`/`generateText` callers outside `executeChatTurn`, and connector
sends that skip `socialReplyBatchRequestSchema` validation.

## Rollout

Uncovered paths carry `rollout` slices routed to an accountable owner through
JOV-3720. Coverage always reports a denominator and a reviewed version; no
blanket "everywhere" claim is allowed. The weekly advisory Slop Gate is
retired; `@jovie/copy` and the deterministic `copy-gate` ci-fast lane replace it
(see `canon/VOICE.md`). This issue adds no recurring automation.

## GBrain authoring

GBrain pages authored by agents retain source and date and distinguish
proposals from observed facts; corrections use supersedes, not silent rewrites
(`apps/web/lib/ovie/operational-memory.ts`).
