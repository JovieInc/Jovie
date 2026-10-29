---
paths: ["apps/**", "packages/**", "scripts/**", ".github/**", "workers/**", "tools/**", "**/package.json"]
---

# Build vs Buy, Prior Art First

Canon: [canon/BUILD_VS_BUY.md](../../canon/BUILD_VS_BUY.md). Config:
`canon/build-vs-buy.json`. Enforced by PR Fleet Rules and `pnpm preflight:changed`.

Before writing a module or adding a dependency, decide in this order: moat (own
it) → platform feature → tiny need (write the few lines) → commodity (a
well-maintained package) → the approved library for that role
(`canon/data-architecture.json`, `packages/api-client`). Never vendor-fork without
a reason. A 50k-line library for a 2-line need loses; a 10k-line need with a
one-click maintained package wins. Do not hand-write 10k lines we must debug.

- **Adding a dependency:** the PR body needs `## Build-vs-buy` with `Package`,
  `Size`, `Transitive`, `Maintenance`, `Why`. Get the facts with
  `node scripts/build-vs-buy-facts.mjs <package>`.
- **Adding 400+ hand-written lines in one domain (new files):** the same section
  with `Considered` and `Why` (what package or platform feature you checked).
- **Redefining a commodity** (date helpers, markdown, retry/backoff,
  debounce/throttle, CSV, uuid, deep clone/equal, class names): CI names the
  approved package. Waive only with `// build-vs-buy-ok: <reason>`.
- **Algorithmic cores** (ranking, matching, resolvers, schedulers, pricing,
  scoring, merge/queue logic; new or rewritten files, or label `type: algorithm`):
  research prior art FIRST and cite it in gbrain under `research/<slug>`
  (`jovie research`); then write our own design from first principles; then
  compare, keep the best of each, and harden with tests and a benchmark against
  the prior art. The PR body needs `## Prior art` with links, `Research`,
  `Comparison`, `Benchmark`. Planning agents do the research step before the plan.
