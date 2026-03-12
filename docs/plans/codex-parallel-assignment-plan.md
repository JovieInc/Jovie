# Codex Parallel Assignment Plan (Top Consolidation Issues)

This plan assigns the highest-impact consolidation issues to parallel Codex streams while preserving dependency order and merge safety.

## Top Issues to Run in Parallel (Wave 1)

These can be executed simultaneously because they touch different seams and can land independently.

### Codex-1 — Transport Policy Unification
- **Linear**: JOV-1538
- **Scope**: Client read paths; migrate raw `/api` fetch usage toward shared query/fetch primitives.
- **Primary outcome**: New and existing client reads follow one transport standard.

### Codex-2 — Resilience Primitive Consolidation
- **Linear**: JOV-1539
- **Scope**: Shared timeout/retry wrappers across provider and infra call sites.
- **Primary outcome**: One bounded-failure policy instead of local implementations.

### Codex-3 — API Contract Centralization
- **Linear**: JOV-1540
- **Scope**: Shared request/response contracts imported by routes and hooks.
- **Primary outcome**: Type-safe wire contracts with no route/hook drift.

### Codex-4 — Clipboard Primitive Adoption
- **Linear**: JOV-1541
- **Scope**: Replace hand-rolled copy logic with canonical clipboard hook/helper.
- **Primary outcome**: Consistent UX and error handling for copy actions.

## Next Parallel Wave (After Wave 1)

These should begin once Wave 1 contracts are available.

### Codex-5 — Canonical Entity Contracts
- **Linear**: JOV-1542
- **Depends on**: JOV-1540

### Codex-6 — Spotify Stack Consolidation
- **Linear**: JOV-1543
- **Depends on**: JOV-1539, JOV-1540

### Codex-7 — Release/Track Loader Convergence
- **Linear**: JOV-1544
- **Depends on**: JOV-1538, JOV-1542, JOV-1543

### Codex-8 — Mutation Flow Merge
- **Linear**: JOV-1547
- **Depends on**: JOV-1538, JOV-1540

## Execution Rules
- Keep each PR mapped to exactly one Linear issue.
- Preserve small PR limits: ≤10 files changed and ≤400 diff lines.
- Rebase each Codex branch before merge and resolve overlap by dependency order.
- Keep sensitive issues (JOV-1550, JOV-1551, JOV-1552) excluded from Codex auto-execution until human review.

## Recommended Sequencing
1. Start **Codex-1/2/3/4** immediately in parallel.
2. As soon as shared contracts are merged, start **Codex-5/6/8** in parallel.
3. Start **Codex-7** after entity + transport + Spotify prerequisites are stable.
4. Queue sensitive-review issues for human-gated planning only.
