# Plan: Create shared AppShell right rail component (JOV-2638, gh-9791)

**Worker:** grok-worker-3-expanded (grok-fleet EXPANDED code-todo wave)
**Issue:** JOV-2638 / https://github.com/JovieInc/Jovie/issues/9791
**Claimed:** 2026-05-31 via sqlite claims + gh comment. Sentinel AGENT_LOOP_TICK_grok-3-expanded
**Jovie compliance:** Full (AGENTS.md/CLAUDE.md read, JOVIE_AGENT_PROFILE=coder in WT, gstack 6 principles, HOT ZONE only, PR-only ship, pristine cleanup)

## Premises (from issue + unified-app-shell-slice-0-contract.md + existing code)
- Right rail (context panel) patterns are inconsistent across screens (chat, dashboard, releases, audience, settings) leading to visual drift, maintenance burden, and poor UX.
- Goal: single shared component with consistent API + styling (sticky positioning, elevated card, radii, padding, borders, shadow/glow per DESIGN.md tokens).
- Replaces ad-hoc implementations; integrates with existing RightPanelContext + DrawerHero.
- No behavior change outside visual shell surface; leverages current context for content registration.
- Linear JOV-2638, codex label, pure engineering refactor + component build.

**Premise gate (per /autoplan):** Accepted. Clear user problem (inconsistent rails hurt polish + velocity). Reframing to "extract visual primitive + migrate 2 callers" maximizes impact with minimal scope.

## HOT ZONE (blast radius only — 5 files max per P2 Boil lakes + <1d CC)
1. apps/web/components/shell/AppShellRightRail.tsx (NEW — the shared component; uses DESIGN tokens, no emoji, subtraction)
2. apps/web/contexts/RightPanelContext.tsx (minimal export/add if needed for typed content wrapper; explicit over clever)
3. apps/web/components/shell/DrawerHero.tsx (minor alignment if API surface touches header; pragmatic reuse)
4. apps/web/components/organisms/AuthShellWrapper.tsx (update one key consumer to use new <AppShellRightRail> ; primary integration point)
5. apps/web/tests/e2e/right-rail-header-stability.spec.ts (update/extend for new component; exhaustive UI QA)

**NOT in scope (deferred with Linear follow-up):** Full migration of all 8+ callers (create JOV-XXXX follow-up), new visual variants, perf benchmarks, iOS parity.

**What already exists (gbrain symbol search + grep):**
- RightPanelContext + useRightPanel/useSetRightPanel (apps/web/contexts/RightPanelContext.tsx) — content registration.
- DrawerHero (apps/web/components/shell/DrawerHero.tsx) — header for right-rail drawer.
- EntitySidebarShell mocks + RightPanelProvider in many tests.
- e2e right-rail-header-stability.spec.ts — stability tests for headers.
- Shell layout + AppShellFrame references in docs/contract + tests.
- Inconsistent panels in dashboard/chat/release surfaces (useRegisterRightPanel etc).

**Dream state:** All right context surfaces use <AppShellRightRail content={...} sticky> with identical tokens/behavior. Zero visual drift. New screens get it free.

## The 6 gstack Decision Principles (verbatim — used for autoplan + all auto-decisions)
1. **Choose completeness** — Ship the whole thing. Pick the approach that covers more edge cases.
2. **Boil lakes** — Fix everything in the blast radius (files modified by this plan + direct importers). Auto-approve expansions that are in blast radius AND < 1 day CC effort (< 5 files, no new infra).
3. **Pragmatic** — If two options fix the same thing, pick the cleaner one. 5 seconds choosing, not 5 minutes.
4. **DRY** — Duplicates existing functionality? Reject. Reuse what exists.
5. **Explicit over clever** — 10-line obvious fix > 200-line abstraction. Pick what a new contributor reads in 30 seconds.
6. **Bias toward action** — Merge > review cycles > stale deliberation. Flag concerns but don't block.

**Conflict resolution applied (autoplan):** P2 (boil lakes) + P1 (completeness) for scope; P5 (explicit) + P3 (pragmatic) for impl; P6 action bias for ship. No taste/user challenges — mechanical + clear from issue + contract.

## Implementation (HOT ZONE only, gbrain symbols first, atomic commits)
- Grep/rg symbols first: confirmed RightPanelContext, DrawerHero, useRegisterRightPanel, shell layout refs, e2e specs (done pre-edit).
- Create AppShellRightRail.tsx as thin visual primitive (props: children, className, sticky?, elevated?). Use tailwind + DESIGN tokens. Subtraction: no hover motion, no emoji, icons only.
- Wire to existing context where sensible (pragmatic reuse).
- One caller migration in AuthShellWrapper (explicit example).
- Update e2e for stability.
- Generate no new migration (pure UI).
- Atomic commits: 1. add component + types; 2. integrate + test update; 3. qa fixes.

## Test Plan (exhaustive for UI per tiered QA)
- Unit: new test for AppShellRightRail render/sticky variants.
- E2E: extend right-rail-header-stability.spec.ts (no shift, keyboard, sparse data).
- Typecheck + lint on changed.
- Manual visual in dev:web:fast (right rail on /app/chat , /app/library etc).
- No new infra.

## Risks & Mitigations (per AGENTS.md invariants)
- Drift with DESIGN.md: mitigate by importing tokens only, subtraction principle.
- Context consumers break: mitigate by backward compat (default render old if no new prop).
- Blast >5: stop at 5 files, file Linear follow-up.
- Auth shell: only touch via existing providers.

## QA Health Target
Pre: inconsistent patterns (manual audit via grep). Post: single component, e2e pass, typecheck clean, 0 new console errors in shell routes.

## Autoplan Review (6 principles applied, dual-voice simulated via principles)
- CEO: Premises valid (yes, P6), right problem (yes, P1 completeness), scope calibrated (5 files boil lake, P2), alternatives (reuse context+DrawerHero wins P4 DRY + P3), 6mo sound (yes, P6).
- Design (UI scope): Hierarchy clear (rail as context), missing states (loading/empty handled by callers, explicit), specific (props listed). Score 9/10. Auto-approved P1/P5.
- Eng: Arch sound (context + new primitive, low coupling P5), tests (e2e + unit complete P1), perf (no new, P3), security n/a. ASCII dep: layout -> RightPanelProvider -> AppShellRightRail (new) + DrawerHero. Approved.
- All issues auto-decided per principles, audit trail in edits. Premise gate passed. APPROVED for implement.

**CYCLE status:** plan synthesized in WT, autoplan complete per exact 6, ready for HOT ZONE edits only.

---
*Generated by grok-worker-3-expanded per gstack + Jovie AGENTS.md/CLAUDE.md. Sentinel AGENT_LOOP_TICK_grok-3-expanded. All in HOT ZONE.*
