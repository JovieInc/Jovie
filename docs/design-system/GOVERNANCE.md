# Design Governance — standing initiative

Design governance is a **standing company initiative**, not a one-time audit.
Drift between design docs, skills, tokens, and enforcement is a continuous
failure mode: docs age, symlinks break, enforcement scripts get added without
being wired. The countermeasure is a single fail-closed audit that runs
**locally and weekly** (informational / issue-only). It is **not** a `ci-fast`
or PR Ready merge gate.

- **Audit:** `pnpm design:governance:audit` → `scripts/design-governance-audit.mjs`
- **Local:** run `pnpm design:governance:audit` (and `pnpm design:tokens:export:check`)
  during design-governance work. Token export `--check` is the freshness ratchet.
- **PR / merge-queue:** `scripts/ci-fast-lanes.mjs` design-conformance remains
  `pnpm design:conformance:gate` only — same as origin/main. Do not expand the
  always-run remaining group with `design:authority:check`,
  `design:tokens:export:check`, `design:governance:audit`, or
  `lint:touch-target`.
- **Weekly:** `.github/workflows/design-governance.yml` — Monday 08:17 UTC +
  `workflow_dispatch`. Informational / standing-issue only — **not** a required
  merge-gate workflow. Scheduled runs `exit 0` and file a standing issue on
  drift. The same workflow also runs the invariant-stewardship audit as a
  periodic safety net and on `founder-decision-recorded` /
  `invariant-enforcement-failed` repository events plus registry/evidence
  pushes to `main`. Do not add a second scheduler.
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
   `lint:touch-target` and `lint:eslint` (missing = FAIL). If
   `scripts/ci-fast-lanes.mjs` does not list `design:authority:check`,
   `lint:touch-target`, `design:tokens:export:check`, or
   `design:governance:audit`, that is WARN only — weekly + local, not a
   merge halt. `lint:eslint` in ci-fast is also WARN until its dedicated
   blocking lane lands (eslint casing backlog is a separate PR).
6. **Doc claims vs reality** — the custom ESLint rule count claimed in
   `.claude/rules/code-style.md` must equal the distinct `@jovie/` rule keys
   configured in `apps/web/eslint.config.js`.
7. **Stale completion docs** — `DESIGN_COMPLETE.md` must carry a superseded
   banner rather than contradict live tests.
8. **Design-invariant projection** — `JOV-INV-019` in
   `canon/invariants.jsonl` is the only executable list of design-agent
   invariants. The generated LLM manifest, design authority guard, and this
   audit consume that record. The audit injects a contract-change probe and
   fails unless both generator output and authority-guard rejection change.
9. **Shared-UI visual arbitrary values** — every production TypeScript source
   under `packages/ui` cannot grow one-off visual Tailwind values. Tests,
   stories, fixtures, generated output, and build/tooling artifacts stay
   excluded. Exact file/value/count debt may only shrink
   (`pnpm design:shared-ui-visual-arbitrary:check`).
10. **Shadcn / Typeset outcome inventory** — enrolled primitives keep a
    machine-readable comparison rubric against public Shadcn docs and Typeset
    typography concepts (`pnpm component-ship-gate` + this audit). Missing or
    unknown benchmark dimensions fail closed. No Shadcn/Typeset implementation
    is imported.

Exit code is non-zero on any FAIL; WARN never blocks. Failures print the
exact offending values so remediation is mechanical.

## The wiring rule

**Do not add new design enforcement to the always-run `ci-fast` remaining
group.** New CI must not slam the merge queue. Keep `design-conformance` at
`pnpm design:conformance:gate` and keep `lint:touch-target` off the
structural lane. Wire new checks into `pnpm design:governance:audit` (local)
and the weekly `.github/workflows/design-governance.yml` dispatch (issue-only).
When you add a check, add it to `scripts/design-governance-audit.mjs`. Absence
from `ci-fast-lanes.mjs` is WARN, not FAIL — the audit must not demand a
merge halt.

Exception (JOV-5301): the remaining-group `design-system-source-ratchet` lane
is a ~100ms filesystem count of apps/web arbitrary Tailwind values and
`--linear-*` usage. It fails only on growth so a source-green PR cannot enroll
and UNMERGEABLE an ALLGREEN group. It does not expand `design-conformance:gate`,
unit tests, or e2e.

Do not add a heavy new required workflow for design governance. The weekly
workflow is the standing safety net for drift that no PR happened to touch.

## How to add a check

1. Add a check to `runDesignGovernanceAudit()` in
   `scripts/design-governance-audit.mjs` that reports via
   `report(id, 'PASS' | 'WARN' | 'FAIL', detail)`.
2. Fail closed: unreadable sources are FAIL, never silently skipped.
3. Use WARN for checks whose enforcement is intentionally pending or that
   must not expand PR Ready (and say so); everything else is FAIL.
4. Keep the weekly workflow path list in
   `.github/workflows/design-governance.yml` in sync if the check watches
   files it does not already cover.
5. Document the new drift class in the list above.
