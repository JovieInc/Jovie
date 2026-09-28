# Company repository source contract

Owner: company engineering / Tim White. Updated: 2026-09-24.
Scope: shared source/documentation boundaries, not product-specific configuration.

Company canon is owned in Jovie's `canon/OPERATING_SYSTEM.md`,
`canon/ENGINEERING.md` and `canon/FLEET.md`. This portable projection summarizes
those boundaries for other repositories. Update this source first and distribute
reviewed immutable revisions; never overwrite a consumer's local instructions.

- Each repository owns its README, AGENTS, manifests, workflows, dependencies,
  tests, build, release, rollback and runtime declarations. Source code and real
  manifests outrank stale prose. A common standard does not imply one stack.
- Company repositories ship independently under their current owners and gates.
  A cross-repo hold requires fresh evidence of a specific shared bottleneck,
  named owner, expiry and release condition. Concurrent CI alone is not evidence.
- Shared policy/tool copies record canonical repository, path, full Git revision
  and content hash. Updates and rollback are independent consumer PRs. A pinned
  copy is reproducible; it is not automatically the newest revision.
- Generated documentation is derived from local source. Review related prose
  when source changes. Hash parity cannot establish semantic correctness.
- New or changed fleet delivery gates qualify in nonblocking shadow first.
  Existing required checks remain enforced. Promotion needs representative actual
  ships, correctness, pass rate, p95 duration, throughput/cost, failure isolation,
  accountable ownership and tested rollback. Do not invent approved thresholds.
- Preserve meaningful tests and current coverage for executable changes. Clearly
  distinguish source, local tests, hosted CI, review, native queue/merge,
  deployment, observed runtime, persistence and customer outcome.
- Preserve active writers and the existing deployment/commissioning controller.
  Documentation does not grant credentials, host changes, service activation,
  external messaging, release-control changes or production mutation authority.
- Keep secrets, sessions, private memory, operational logs and host state out of
  shared projections. Copy only reviewed non-secret source appropriate to the
  destination's visibility. Retired instructions are history, never activation.

Distribution mechanism: JovieInc/ci `docs/DOCUMENTATION-PARITY.md`, tracked by
JOV-6607 alongside JOV-6555. Existing repo-local freshness checks remain in place.
This source contract does not certify that a consumer implements any mechanism.
