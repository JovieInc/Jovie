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

## Post-selection onboarding brief (JOV-8408)

This slice belongs to **`chat-persona`**, the JOV-6475 surface. **Summer** is
its accountable owner; implementation delivery does not transfer that ownership.
The registry still inventories broader chat paths with advisory review. This
brief adds no broader authenticated, mobile, fallback, or general chat coverage.

Eligibility is exactly one compact response on the onboarding-mode handler after
`confirmSelectedArtist` accepts a new valid Spotify picker selection or pasted
artist URL and returns matching server enrichment. The newest user selection
must have a valid provider ID different from the current server state. Opener,
search, malformed ID, repeat selection, later interview/checkout turns, other
roles and authenticated/mobile chat are outside this boundary. An ownership
conflict follows the existing recovery path before generation and cannot use
this brief to authorize an action.

[`buildPostSelectionWritingBrief`](../../apps/web/lib/chat/post-selection-writing-brief.ts)
runs inside the server confirmation, after enrichment updates the request-local
state and before any draft. Its typed `writingBrief` result stays alongside the
confirmation; it is excluded from the client tool message and stream chunks.
The handler reconstructs authoritative state from persisted server tool history.
The builder accepts no client tool history, operator instructions, or personal
voice guesses. Feeding the consumer brief to the existing writer and targeted
revision are tracked separately in JOV-8409; this is context-contract evidence,
not proof of reviewed model output or runtime activation.

An available brief separates `operatorContext` (surface, issue, policy and owner)
from `consumerContext` (audience, purpose, English from approved onboarding copy,
compact form, allowed claims, evidence, freshness, ownership and protected facts).
Only current same-subject public follower evidence from the confirmation can
supply the observation. Evidence is projected through `projectPublicEnrichedFacts`
with its existing freshness policy; source IDs, click-through URLs, retrieval
and measurement dates, verification and source kind survive. An absent
measurement date stays unknown. Count zero remains zero; missing counts never
become zero, monthly listeners or Jovie reach. Source counts establish no DSP
contact permission. Artist selection leaves ownership unverified: use “this
artist,” with no claim, edit, publish or checkout authority granted by this brief.

`ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick` and approved existing
`ONBOARDING_OPENER_PRIMARY` copy are **voice-only** references. Their recent
release, memory and access facts are not allowed claims about this visitor.
Protected IDs, names, exact counts, provenance and unknown release/listener
facts cannot be rewritten into stronger claims. Thin voice context selects
`jovie-persona-neutral`, the approved `jovie-persona` register in
[`canon/VOICE.md`](../../canon/VOICE.md#registers); it never infers the visitor’s
style from intake notes or Spotify data.

No new selection, missing/failed/stale/inaccessible/contradicted evidence,
mismatched authoritative state, or unavailable disclosure authority yields a
typed `unavailable` result with a reason and no consumer payload. Public fact
permission and explicit server disclosure authority are both required; neither
model confidence nor a client-replayed result supplies them.

EVENT: this contract grants evidence disclosure only, never account ownership or
action authority. Ship now: build the bounded brief with focused Vitest proof.
Re-evaluate when JOV-8409 connects it to the writer. Then: verify the exact draft
and revision against the same consumer evidence without broadening coverage.

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
