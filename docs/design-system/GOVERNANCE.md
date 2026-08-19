# Design Governance — standing initiative

Design governance is a **standing company initiative**, not a one-time audit.
Drift between design docs, skills, tokens, and enforcement is a continuous
failure mode: docs age, symlinks break, enforcement scripts get added without
being wired into CI. The countermeasure is a single fail-closed audit that
runs on every source PR (cheap `ci-fast` design-conformance lane) and weekly
on a schedule, so no human has to re-audit by hand.

- **Audit:** `pnpm design:governance:audit` → `scripts/design-governance-audit.mjs`
- **PR / merge-queue:** `scripts/ci-fast-lanes.mjs` design-conformance lane
  (`pnpm design:conformance:gate && pnpm design:authority:check && pnpm design:tokens:export:check && pnpm design:governance:audit`)
- **Weekly:** `.github/workflows/design-governance.yml` — Monday 08:17 UTC +
  `workflow_dispatch`. Informational / standing-issue only — **not** a new
  required merge-gate workflow.
- **Escalation:** a failing scheduled run opens (or updates) one standing
  GitHub issue titled **"Design governance drift detected"** — deduped by
  title, so there is never more than one open drift issue.

## Drift classes the audit enforces

Each class below was found in the 2026-08 governance overhaul and is now a
permanent check:

1. **Skill plumbing** — every symlink under `.claude/skills/` must resolve,
   and every `ownedSkills` pin in `skills-lock.json` must resolve to a live
   `.claude/skills/<name>/SKILL.md`.
2. **gstack symlink** — `.claude/skills/gstack` is a symlink to the vendored
   fork at `.agents/skills/gstack/` (not a git submodule). Design skill
   `SKILL.md` files resolve into that fork.
3. **Token export freshness** — the root `design.tokens.json` export must
   match the Noir Ion anchors in `apps/web/styles/design-system.css`. The
   audit delegates to `scripts/generate-design-tokens-export.mjs --check`.
4. **DESIGN.md internal consistency** — the dark sidebar rgb triplet in the
   Noir Ion table, the Sidebar (App Shell) table, and
   `apps/web/styles/linear-tokens.css` `:root.dark` must agree.
5. **Enforcement wiring** — root `package.json` must declare
   `design:authority:check`, `design:tokens:export:check`, and
   `design:governance:audit`; `apps/web/package.json` must declare
   `lint:touch-target` and `lint:eslint`. `scripts/ci-fast-lanes.mjs` must
   run `design:authority:check`, `lint:touch-target`,
   `design:tokens:export:check`, and `design:governance:audit` (missing =
   FAIL). `lint:eslint` in ci-fast is WARN until its dedicated blocking
   lane lands (eslint casing backlog is a separate PR).
6. **Doc claims vs reality** — the custom ESLint rule count claimed in
   `.claude/rules/code-style.md` must equal the distinct `@jovie/` rule keys
   configured in `apps/web/eslint.config.js`.
7. **Stale completion docs** — `DESIGN_COMPLETE.md` must carry a superseded
   banner rather than contradict live tests.

Exit code is non-zero on any FAIL; WARN never blocks. Failures print the
exact offending values so remediation is mechanical.

## The wiring rule

**Any new design enforcement script MUST be wired into
`scripts/ci-fast-lanes.mjs` (or a required CI lane) in the same change that
introduces it.** An enforcement script that exists but never runs is worse
than no script — it claims protection it does not provide. When you add one,
add a check for its presence to `scripts/design-governance-audit.mjs` so the
audit fails the moment it gets unwired.

Do not add a heavy new required workflow for design governance. The cheap
deterministic check belongs in the existing `ci-fast` design-conformance
lane (`docs/PR_FLOW.md`). The weekly workflow is a standing safety net for
drift that no PR happened to touch.

## How to add a check

1. Add a check to `runDesignGovernanceAudit()` in
   `scripts/design-governance-audit.mjs` that reports via
   `report(id, 'PASS' | 'WARN' | 'FAIL', detail)`.
2. Fail closed: unreadable sources are FAIL, never silently skipped.
3. Use WARN only for checks whose enforcement is intentionally pending (and
   say what lands it); everything else is FAIL.
4. Keep the weekly workflow path list in
   `.github/workflows/design-governance.yml` in sync if the check watches
   files it does not already cover.
5. Document the new drift class in the list above.
