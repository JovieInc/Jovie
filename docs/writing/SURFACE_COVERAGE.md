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

The product runner lives in
[`jev-product-response-pilot.mjs`](../../scripts/invariants/jev-product-response-pilot.mjs)
(JOV-8413). A trusted runner injects `executeChatTurn`, `reviseWritingPilot`,
the existing AI SDK stream serializers, `buildScriptedFallbackResponse`,
`encodeToolEvents`, and `parseTokens`. It supplies the server confirmation part
from `confirmSelectedArtist`, the approved writing brief and budget, and
`evaluationOptions` for existing Gateway admission/freshness/free-call accounting.
No application module imports this runner or its script-only evaluation SDK.

The caller also supplies `evidence.withRun(key, work)`: an exclusive durable
lock per key, including across processes, with detached JSON `load`/`save`
snapshots. The runner saves the original, optional revision, review attempts and
terminal receipt before creating a response. Identical saved inputs reuse that
terminal outcome; an interrupted record becomes `review-needed` without another
writer or judge call. Storage failure withholds delivery. Operator context and
conversation history are excluded from judgment and saved artifacts.

`reviewed` serializes exactly the receipt's artifact and the confirmed server
chip. `review-needed` returns no response. An optional caller-approved text-only
script turn, bound to its digest, authority and applicable failure reasons, uses
the existing fallback serializer and the same server evidence. Neither writer
candidate is fallback text. Entity/skill tokens require the app catalog resolver
and are withheld in this selected-artist onboarding pilot.

**Ship now:** runner-only observation with at most one revision and two review
rounds. **Re-evaluate when:** JOV-8414 and JOV-8415 supply held-out quality and
calibrated promotion evidence. **Then:** assess pilot promotion under those
receipts. Production streaming remains `post-generation-advisory`; this runner
adds no route, request option, recurring job or global chat gate.

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
