# Idea Radar signal producer

Issues: JOV-2905, JOV-5916, JOV-2966

Executable contract: `scripts/idea-radar/idea-radar.mjs`

Migration registry: `scripts/idea-radar/idea-radar-registry.json`

Idea Radar is an external opportunity-signal producer for the canonical evidence
lifecycle (JOV-5916). It is event-driven and may prioritize investigation, but it
does not decide what to build. JOV-2966 owns capability benchmarks and the company
capacity allocator owns admission.

## Flow

1. A source adapter emits a new/changed item, pending-decision research result,
   founder/customer observation, material internal change, or accumulated
   low-value cluster crossing the expected-information threshold.
2. The normalizer records provenance, time, access constraints, freshness,
   quality, uncertainty, novelty, cheapest validation, and capacity impact.
3. Stable source identity converges duplicate deliveries on one JOV-5916 evidence
   object. Replacements use explicit supersession.
4. Routine observations remain evidence. A benchmark routes to JOV-2966; founder
   judgment routes to the Unified Ovi Certification Inbox; Linear is used only
   after an executable next action exists.
5. Outcome receipts link later usage, revenue, rejection, modification, or expiry
   to the original evidence identity and calibrate prior judgments.

## Original source and model interpretations

The existing `jovie.canonical-evidence/v1` object accepts optional content through
`normalizeObservation`; no new registry or storage authority is introduced.
Legacy callers keep their current fields and output shape.

| Input | Preserved evidence |
| --- | --- |
| `originalSource: { text, author, sourceTimestamp, supersedes? }` | `sourceRevisions[]`: exact wording, author, source timestamp, original source URL (including fragment), source type/item ID and access constraints |
| `interpretations: [{ sourceRevisionId?, model?: { name?, version? }, generatedAt, summary, hypotheses?, suggestions? }]` | `interpretations[]`: separately attributed model prose tied to one source revision |

A source revision is explicitly exploratory. It is neither a conclusion nor a
build or publication authorization. Model summaries, hypotheses and suggestions
remain model interpretations, never founder facts. Supply the model name and
version actually observed by the producer; each absent value becomes the literal
`unknown`. Do not infer a model from a tool, provider, agent name or current default.
An attribution correction appends a distinct interpretation rather than replacing
an unknown attribution already recorded.

Source records retain whitespace and the supplied timestamp spelling. The
existing canonical URL is still used for evidence deduplication; the original URL
is retained separately within each revision. Delivery time stays in the existing
`provenance.observedAt` and does not create a new source revision on replay.
Content-derived IDs and frozen records preserve originals and interpretations.
`convergeEvidence` unions these records even when a newer legacy delivery has no
content fields. It verifies IDs after JSON storage round trips and rejects
in-place content changes.

To revise source wording or provenance, provide `originalSource.supersedes` with
the prior source revision ID. The prior record remains retrievable. An isolated
normalization may contain references to earlier events; converge it with the
existing evidence before consumption. Convergence rejects missing ancestors,
independent replacement roots and interpretations referencing absent revisions.
Replays and out-of-order convergence retain the same history. Existing top-level
`supersedes` continues to describe evidence replacement, not source revision.

`getOriginalSource(evidence)` returns only the original source record;
`getOriginalSource(evidence, revisionId)` selects a specific revision. Neither
returns model prose. Missing capture or an unknown revision returns `null`;
incomplete or modified history throws. Never substitute `problemOpportunity`
or another model-written summary when the source is missing. Interpretations are
independently retrievable from `evidence.interpretations` by ID or source revision.

The source-only accessor is an in-process contract, not a live GBrain retrieval
endpoint. Capture only material authorized for the existing canonical destination
and its access restrictions; private source text does not belong in public
fixtures, documentation, PRs or a shared GBrain page by default. Runtime binding
remains with JOV-5916 and requires admitted adapter write/read receipts.

## Legacy mapping

The registry maps the legacy GBrain pages/preferences, `/last30days` research,
Linear ledger issues, and Slack cards/reactions into JOV-5916 without discarding
source content or links. Those legacy records are migration inputs, not a second
active store. Founder reactions are founder-taste evidence; they do not establish
customer demand, paid behavior, benchmark superiority, or build authorization.

Hermes is retired. No weekly Idea Radar cron is authoritative or configured in
the current runtime. A periodic catch-up is permitted only as a bounded missed-
event safety net with explicit missed-event evidence.

## Decision record

**Ship now:** enforce the producer boundary, deterministic convergence, routing,
calibration, immutable source revisions and separately attributed interpretations
in source and tests.

**Re-evaluate when:** JOV-5916 exposes its durable adapter API or a migration run
is admitted by that owner.

**Then:** bind these normalized objects and migration mappings to that canonical
API without changing identity or creating a second store.
