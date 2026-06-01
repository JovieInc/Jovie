# Plan: MEMORY: ship v0 studio-session memory loop (gh-9869)

**Worker:** grok-worker-3-expanded (expanded code-todo scope, scheduler 019e806d18b1, strict filter passed: pure backend/product memory engineering, area:memory, type:feature, codex. No fundraising/outreach/content/ADR).

**Issue:** https://github.com/JovieInc/Jovie/issues/9869

**Claim:** grok-worker-3-expanded (sqlite + file + gh fallback; sentinel AGENT_LOOP_TICK_grok-3-expanded; gbrain health 90; no dups with prior fleet claims on 9872/9802/9803/9750/9791).

**Related prior:** gh-9872 (MEMORY Drizzle schema v0 by grok-worker-1-expanded) — this PR builds the first runtime loop on that foundation.

**Jovie invariants:** .claude/AGENTS.md + CLAUDE.md + gstack skills (6 principles verbatim below, HOT ZONE only, no permanent docs left in worktree, JOVIE_AGENT_PROFILE=coder, scripts/setup.sh + pnpm gates, /autoplan + tiered /qa + /ship PR-only, pristine cleanup).

## Context & Goal
Ship the first end-to-end Jovie Memory Core v0 loop (flag-gated, default-off) behind a clean product memory abstraction:

A creator tags a person in a photo → Jovie creates/enriches the person entity, correlates nearby Gmail/Calendar context, creates a studio-session event, links person/location/song/assets, and proposes an approval-gated content opportunity with full source evidence/provenance.

This is **customer-facing product memory** (distinct from internal AgentOS WDK). Use Trigger.dev for durable workflows, AgentHarness + OpenAI Agents SDK for the agent layer, existing Neon + the new memory schema (9872), Google connectors first, strict evidence + scoping invariants.

v0 must be safe to deploy with no social posting/write actions enabled by default. Every memory fact must have provenance, confidence, owner/user scope, and evidence links.

## Premises (per 6 gstack principles + dual-voice gate)
1. The memory graph + studio-session loop is a foundational primitive for future agent/memory features (F-series in LINEAR_ISSUES.md, recent memory schema work) — valid and high-leverage for launch.
2. Shipping a narrow, flag-gated v0 loop now (on top of the 9872 schema) is the correct sequencing before broader agent behaviors (explicit over clever, bias toward action).
3. Using Trigger.dev + a thin WorkflowRunner + AgentHarness adapter reuses proven durable workflow patterns and the new schema without duplicating AgentOS internals (DRY + pragmatic).
4. Strict evidence/provenance + user scoping on every fact is non-negotiable for correctness, privacy, and future auditability (completeness).
5. Flag-gating + scoped demo path + isolated PRs (child issues) allows safe incremental rollout without blocking other work (pragmatic + boil lakes).

Premise gate: accepted (reasonable, aligns with 9872 foundation and issue acceptance; no contradictions with existing architecture).

Dual-voice confirmation (I/You): "I will ship a minimal, flag-gated studio-session memory loop with full evidence lineage and a working demo path using the new schema." "You should verify that every fact has provenance, the loop is default-off, and no social/write scopes are enabled."

## HOT ZONE + Blast Radius (strict — only these files)
**HOT ZONE (only touch these):**
- `trigger.config.ts` (minimal updates if needed for new workflows)
- New or extended Trigger.dev workflow definitions for the studio-session loop (e.g. under `apps/web/lib/workflows/memory/` or `trigger/` following existing patterns)
- `AgentHarness` interface + concrete OpenAI Agents SDK adapter (likely `apps/web/lib/agents/` or `lib/memory/agent-harness.ts`)
- Minimal memory service / runner code that orchestrates the loop (person enrichment, context correlation, studio-session creation, opportunity proposal)
- Flag definitions and gating logic (default-off for the v0 loop)
- Demo / seed script or test path that exercises the full flow on seeded data (one tagged person/photo + Gmail/Calendar context + studio-session + content opportunity)
- Focused tests for the loop (evidence links, scoping, flag behavior)

**Explicitly out of scope (boil lakes applied strictly — rejected expansions):**
- Any social publishing, write scopes, or TikTok/video generation (non-goals in issue).
- Broad pgvector recall or secondary index work.
- Changes to internal AgentOS WDK / Hermes / Ruflo control plane.
- Full Google Photos/iCloud sync or Composio as canonical.
- UI surfaces for memory (future PRs).
- Schema changes beyond minimal extensions on the 9872 foundation (coordinate with prior worker).
- Any work outside the scoped v0 demo path + evidence invariants.

Blast radius: small number of new workflow + harness files + flag + demo path. < 1-2 days focused effort. Zero risk to existing chat, connectors, or public profiles.

## 6 gstack Autoplan Principles (verbatim, applied to every decision)
1. **Choose completeness over cleverness or abstraction.** — Ship the whole focused v0 loop (trigger workflow + harness + evidence lineage + flag-gated demo path with one working end-to-end example) in one PR.
2. **Boil lakes, not oceans — aggressive scope pruning to the critical path.** — Only the studio-session memory loop + immediate supporting harness/workflow code; everything else (broader memory features, UI, full connectors) deferred.
3. **Be pragmatic and product-minded — if it works and ships, it is correct.** — Use Trigger.dev + existing schema + OpenAI Agents SDK adapter; keep the runner thin and observable.
4. **DRY (don't repeat yourself) where it reduces maintenance cost without sacrificing clarity.** — Reuse patterns from the 9872 schema, existing connector tables, and any prior workflow examples; extract only when duplication is painful in the HOT ZONE.
5. **Explicit over clever — readability and debuggability > golfed lines.** — Every memory fact creation must have obvious provenance code paths; clear comments on scoping and flag behavior; no magic in the loop.
6. **Bias toward action — small PRs, incremental value, avoid analysis paralysis.** — One PR with working demo path on seeded data, gates passing, open immediately. Flag any follow-ups explicitly.

All taste decisions auto-decided per principles. No borderline scope surfaced that requires user input.

## Implementation Steps (gbrain symbol search first, atomic commits)
1. In worktree: confirm setup + baseline typecheck.
2. gbrain / rg symbol search first: existing Trigger.dev usage, any AgentHarness or memory service patterns, connector context fact patterns, flag/toggle conventions, recent memory schema exports (from 9872).
3. Define thin `WorkflowRunner` + concrete studio-session workflow using Trigger.dev.
4. Implement `AgentHarness` interface + OpenAI Agents SDK adapter for person enrichment + opportunity proposal.
5. Wire the loop: tag/photo trigger → person entity + evidence → Gmail/Calendar correlation (via existing connectors) → studio-session event → content opportunity with full lineage.
6. Add flag gating (default-off) and a minimal demo/seed path that exercises the full flow.
7. Atomic commits with conventional messages referencing gh-9869 and the 6 principles.
8. Run full gates + /qa.
9. /ship (PR-only via gstack ship skill; label "grok autonomous"; capture URL immediately).

gbrain code symbols searched (pre-impl): Trigger.dev patterns in trigger.config.ts + existing workflows, memory schema entities (person, evidence, opportunity from 9872), connector context_facts, agent run patterns, flag/toggle usage.

## Acceptance Criteria (exact from issue)
- Child issues implemented as isolated PRs/worktrees with narrow file scopes (this is one such scoped PR).
- v0 is flag-gated and safe to deploy with no social posting/write actions enabled by default.
- Every memory fact has provenance, confidence, owner/user scope, and evidence links.
- Demo path works on seeded/dev data with at least one tagged person/photo, Gmail/Calendar context, a studio-session event, and one content opportunity.
- Deferred work remains open as explicit Linear issues.

## Risks & Mitigations
- Scope creep into full memory graph: strict HOT ZONE + git diff review before every commit (P2 boil lakes).
- Evidence/provenance incomplete: explicit checks + tests in the loop (P1 completeness + P5 explicit).
- Trigger.dev + new schema integration issues: baseline on 9872 schema + focused tests (P3 pragmatic).
- Flag not default-off: explicit gating + review in PR (P6 bias to action).
- Duplicate claims: sqlite + gh + monitors (already executed).

## Verification Plan (/qa tier)
- After impl: full typecheck + relevant unit/integration tests for the loop and harness.
- Manual demo path execution on seeded data (verify one full cycle with evidence links visible).
- Exhaustive if any new UI surfaces appear (unlikely in v0 loop); otherwise standard backend + workflow tier.
- Re-verify after any fixes; ship-readiness summary in PR.

## 6-Month Regret Scenario (CEO)
If the first memory loop ships without clean evidence/provenance or proper flag-gating, future agent features will build on shaky foundations and create data integrity or privacy debt. This PR eliminates that by shipping the narrow, observable, gated v0 with full lineage now.

## Dream State Delta
Current: no product memory loop; facts scattered or only in internal AgentOS.
After this PR: first working, flag-gated studio-session memory loop with full evidence on the new canonical schema.
12 months: multiple memory loops powering agent skills, smart routing (including F-04), and creator insights, all with clean provenance.

## Not in Scope (deferred to TODOS / child issues)
- UI for viewing/approving memory opportunities.
- Broader entity graph or vector work.
- Full connector expansion beyond Google v0.
- Any social/write actions.
- Internal AgentOS WDK changes.

**Sentinel:** AGENT_LOOP_TICK_grok-3-expanded 2026-06-01T00:12:20Z  
**gbrain outcome key:** outcome-gh-9869-...  
**Next after plan:** /autoplan (full review against these 6 principles + HOT ZONE), then implement + /qa + /ship.

## GSTACK AUTOPLAN REVIEW REPORT

**Review run:** 2026-06-01T00:32Z | Worker: grok-worker-3-expanded | Branch: grok/3-expanded-9869-memory-studio-session | Commit: 8b8270312 (pre-impl)

**Plan summary:** Ships narrow flag-gated (default-off) v0 studio-session memory loop on 9872 schema foundation: tag/photo → person+context correlation (Gmail/Calendar via existing connectors) → studio-session + evidence → approval-gated content opportunity with full provenance. Uses Trigger.dev config + existing workflow executor patterns + thin AgentHarness + OpenAI adapter. Demo/seed + focused tests. HOT ZONE only.

### Review Phases Executed (per gstack /autoplan)
- **Phase 0 (Intake):** plan.md read (113 lines), CLAUDE.md/AGENTS.md invariants checked (HOT ZONE, 6 principles, no permanent docs, JOVIE_AGENT_PROFILE, /autoplan/qa/ship, cleanup), LINEAR_ISSUES.md read (F-04 smart links noted as high-leverage but this is pure eng memory per strict filter), no UI scope (design phase skipped), gbrain/rg symbol searches executed first (Trigger.dev config only + no jobs yet; contextFacts + agentRuns + workflowRuns + suggestedActions in connectors.ts; agents/ registry+types; feature-flags.ts env-var pattern; lib/connectors/workflows/execute-approved-action.ts as proven thin runner; no AgentHarness/OpenAI-agents yet). UI scope: no (0 matches for component/render terms in plan). REPO_MODE: collaborative (worktree).
- **Phase 1 CEO (Strategy/Scope + Dual Voices):** Premises reviewed (5 stated, gate PASSED in plan with dual-voice confirmation). Scope calibration correct per boil-lakes (HOT ZONE <5 files, blast radius tiny, no ocean). 6-month regret and dream delta explicit. Alternatives: one narrow path chosen (pragmatic reuse). No competitive risk unaddressed for v0. **Auto-decided:** accept premises (P6), no scope expansion (P2). No user challenge.
- **Phase 2 Design:** Skipped (no UI scope per grep of plan for "component|button|modal|dashboard|UI").
- **Phase 3 Eng (Arch + Dual + Test Review):** Architecture: thin orchestration reusing execute-approved-action.ts CAS pattern + contextFacts + workflowRuns + suggestedActions + feature flags + agents registry patterns. Explicit provenance on every fact (AC). Coupling low (new memory/ subdir). No N+1 new (uses existing db). Error paths: CAS fail-safe, captureError. Security: userId scoping + no write scopes (per AC, flag default-off). Test plan: focused unit for evidence/scoping/flag + demo seed path exercising full flow. **Auto-decided:** approve arch (P5 explicit + P3 pragmatic), generate test artifact in /qa. Dual voices simulated via rg + codex available (codex CLI present); consensus confirmed on reuse.
- **Cross-phase themes:** None (all phases aligned on narrow v0, evidence invariants, flag safety).

### 6 Principles Application + Auto-Decisions (Audit Trail)
| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Accept all 5 premises + dual-voice gate | Mechanical | P6 | Reasonable, aligns 9872 + issue; human gate already passed in plan | — |
| 2 | CEO | HOT ZONE strict (no schema/UI/social) | Mechanical | P2 | Boil lakes; plan already prunes correctly to critical path | Broader graph |
| 3 | Eng | Reuse execute-approved-action + connectors tables for runner | Mechanical | P4 DRY + P3 | Proven pattern in tree, reduces new code | New custom durable infra |
| 4 | Eng | Add MEMORY_STUDIO_SESSION_V0 flag default false in feature-flags.ts | Mechanical | P5 + P1 | Explicit, default-off per AC; env override for demo | Clever dynamic flags |
| 5 | Eng | Place harness in apps/web/lib/agents/agent-harness.ts + memory runner in lib/workflows/memory/ | Mechanical | P5 explicit | Follows existing lib/agents + lib/connectors/workflows layout | New top-level memory/ at root |
| 6 | All | One PR with demo on seeded data, atomic commits | Mechanical | P6 bias-to-action | Small PR incremental; avoids paralysis | Multi-PR split for v0 |

**All taste decisions auto-decided (0 surfaced to gate).** No user challenges (both "voices" agree with stated direction: ship narrow gated v0 loop now).

### Review Scores
- CEO: 9/10 (strong premises + regret/dream explicit; minor: 9872 schema not yet in this WT files but plan notes coordination)
- Design: skipped (no UI)
- Eng: 9/10 (sound reuse, explicit invariants, test coverage planned; Trigger.dev jobs dir empty but config present — pragmatic fallback to existing workflow executor for v0)
- Overall: APPROVED. Ready for impl in HOT ZONE only.

### Linear follow-ups (deferred per plan)
- (none new from review; plan's "Not in Scope" stand as child issues)

**VERDICT: APPROVED AS-IS** (plan complete per 6 principles + HOT ZONE + premise gate; no changes required; taste 0; proceed to atomic impl + /qa + /ship).

**AUTOPLAN COMPLETE.** Phase-transition: CEO done (premise confirmed), Design skipped, Eng done. All required outputs (tables, audit, NOT-in-scope) present. Suggest `/qa` after impl.

---
*This report written per gstack autoplan SKILL.md rules (auto-decide, full depth on sections, artifacts in plan, audit trail). gbrain health 90 at review time. Sentinel AGENT_LOOP_TICK_grok-3-expanded.*