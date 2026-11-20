# Strategy canon (private)

The strategy canon (active company theses, the `theses.jsonl` index and the
thesis documents) is private and lives in the `JovieInc/Ops` repo under
`jovie-private/canon/strategy/`. It was removed from this public repo on
2026-10-28. Read it before planning strategy-sensitive work: pricing,
packaging, free tiers, business model, creator workflow, autonomy/delegation,
model routing, agent UX, orchestration, execution substrate, or company-level
architecture.

How to read it:

- Local checkout: `$JOVIE_PRIVATE_DIR/canon/strategy/README.md`, where
  `JOVIE_PRIVATE_DIR` is the `jovie-private/` folder of a local `JovieInc/Ops`
  checkout (default `~/Ops/jovie-private`).
- Remote: `gh api repos/JovieInc/Ops/contents/jovie-private/canon/strategy/README.md -H 'Accept: application/vnd.github.raw'`
  (swap the path for `theses/<file>.md` or `theses.jsonl`).

The Symphony context gate (`scripts/backlog-orchestrator/context-gate.mjs`)
loads the index from `JOVIE_PRIVATE_DIR`; a relevant strategy miss, including an
unreachable index, is a retrieval defect and blocks the lease, not a silent
proceed. Do not add strategy theses, investor, fundraising or security-map
material back to this repo; the private-data guard blocks those paths.
