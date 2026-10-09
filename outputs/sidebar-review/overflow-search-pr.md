Overflow now uses the existing permitted navigation registry in a bounded More panel. Page search uses the existing command palette with only permitted pages, and scoped pins retain allowed IDs in insertion order. Mobile submenus use Back and focus returns through the existing permanent toolbar. Large registries show up to 12 inline pages, retaining the current destination, and open the complete permission-filtered registry through existing Find a page. All valid pins remain available; callers without search retain every original destination.

No Linear issue — ad-hoc. Proposed base: `main` after parent landing and fresh qualification. Current frozen comparison boundary: `codex/shared-sidebar-foundation`. Layer head: `a4914f19134d74185d574c61c82a3a7e27d1219a`. Web stack qualification head: `245ec38c89228b87f07c7bfffb2e2ce2f1c69c07`. Dependent children remain local and unpublished while their parent is open.

Validation: 18/18 typecheck tasks; all four real CI coverage shards with 2,274 tests passed and 12 skipped; changed-line coverage 1,573/1,588 (99.1%, required 60%). The unchanged browser matrix passed 25/25, with zero skips or flaky cases. The hover-to-click regression failed before repair and passed afterward among 27 focused tests. Existing permitted destinations, routes and IDs are preserved. Successful Jovie desktop and Ovie compact recordings were captured outside performance measurement.

Performance: current full flow recorded zero long tasks; More React maximum 9.8 ms and palette maximum 3.3 ms. Full-flow RAF median 8.3 ms, nearest-rank p95 26.7 ms, maximum 33.6 ms; three intervals exceeded 16.7 ms and 16 exceeded 8.3 ms. Frame-budget acceptance remains unproven. Prior-head 95/99 ms tasks and the failed hover run remain retained with provenance; this clean sample does not establish their cause.

Evidence: `outputs/sidebar-review/web/current/` contains matching raw coverage, reports, CPU profile, traces, screenshots and successful standalone recordings. Local fixture evidence does not establish hosted CI/deployment, authenticated runtime, actual Mac geometry or physical 120 Hz/VoiceOver. Full native private Summer resume remains a separately stated gap. No hosted artifact URL is asserted.

```json
{"releaseWorthy":false}
```

Publication policy correction (2026-10-08): executable PR targets main guard has no draft exception. Proposed base is main. Native and foundation are the only initial draft candidates; each dependent layer stays local until its parent lands, then requires a rebase and fresh exact-head qualification before publication. Previous immediate-parent draft-base proposal is superseded.
