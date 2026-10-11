# Strategy canon

Compact map of active company theses and invariants distilled from founder
direction. Read this before planning strategy-sensitive work: pricing,
packaging, free tiers, business model, creator workflow, autonomy/delegation,
model routing, agent UX, orchestration, execution substrate, or company-level
architecture.

Machine-readable index: [`theses.jsonl`](./theses.jsonl) — one record per
thesis with provenance, status, retrieval anchors, and supersession. The
Symphony context gate (`scripts/backlog-orchestrator/context-gate.mjs`) binds
the matching thesis GBrain pages into the pre-lease receipt; a relevant
strategy miss is a retrieval defect, not a silent proceed.

| Thesis | Status | Effective | Applies to |
|---|---|---|---|
| [Sell outcomes, eliminate creator side quests, keep the execution substrate replaceable](theses/2026-10-02-sell-outcomes-replaceable-substrate.md) | active | 2026-10-02 | business model, pricing, free tier, creator workflow, delegation, orchestration, substrate |

Rules:

- Newer founder direction can amend or supersede a thesis. Mark the loser
  `status: "superseded"` with `supersededBy` pointing at the winner; never
  delete it — history and provenance are retained.
- The GBrain mirror slug for each thesis is its `slug` field
  (`strategy/<name>`); the distilled artifact here is canonical, GBrain holds
  the retrieval copy.
- Do not add raw transcripts or ephemeral telemetry; distill first.
