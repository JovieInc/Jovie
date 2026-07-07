# Autonomous Shipping Doctrine (Jovie Technology Inc.)

**Effective:** 2026-06-22 · **Amended:** 2026-07-06 (no pre-merge human gates, including taste)  
**Status:** Company policy — overrides informal “ask Tim before merge” habits.

> **2026-07-06 amendment:** All CI assumes 100% autonomous shipping with **no
> human in the loop pre-merge — including taste**. Humans steer by opening
> issues and giving app-walkthrough feedback in production; shipping those
> issues is autonomous end to end. Taste-flagged PRs route to strong LLM review
> (`llm-review`) and ship; the taste-classifier comment remains as the signal
> for post-ship walkthroughs. The risk classifier no longer sets
> `blocksUnattendedAutoMerge` for any surface — high-risk surfaces get
> **stricter CI** (smoke + preview evidence), not a human queue.

## Principle

Jovie is a **100% autonomous shipping** company during development.

- **Machines** own correctness: strict CI, security scans, migration guards, auth-boundary tests, bot review, autofix, merge queue.
- **Humans** own **planning** and **production taste** (design, UX, copy, product judgment on what feels wrong in prod).
- **Humans do not** gate merges because a PR touches auth, payments, databases, migrations, or “risky” code paths — **CI and guardrails** gate those.

> Correctness is a machine job. Taste is a human job.

## What humans do

| Human role | Examples |
|------------|----------|
| Plan | Roadmap, priorities, KPIs, Linear triage, architecture decisions |
| Taste (production) | “This onboarding feels wrong,” visual/copy polish, product calls that CI cannot encode |
| Exceptional ops | Credential rotation policy, legal/external sends, spend policy breaches |

## What humans do **not** do in the dev loop

- Per-PR code review for correctness
- Approve merges because of auth/payment/migration surface area
- Block ship pending “human review” when CI is strict-green and non-taste

## Machine gates (required before merge)

- `CI / PR Ready`, `CI / Migration Guard`, security jobs (Trivy, Gitleaks, Sonar, etc.) — **strict**: every check that ran must succeed
- `lib/pr_gates.taste_surface` — taste-touching diffs → label `needs-human-taste`, not generic `needs-human`
- `scripts/taste-label-guard.mjs` (workflow: `Taste Label Guard`) — backstop that auto-clears mis-applied taste labels per the rule below
- Graphite merge queue (`merge-queue` label), squash, signed commits per ruleset
- Hermes `pr-autofix`, `drain-pr-queue`, `pr-merge-queue` (when `HERMES_AUTOMERGE=1`)

## What counts as a taste call (canonical, 2026-06-26)

Apply `needs:taste` / `needs-human-taste` **only** when a change makes a material,
subjective UX/visual judgment only a human can make: a new or changed user-facing
experience, a brand/visual-identity call, or a materially different
interaction/information design. Over-labeling forces a human to review work that
should auto-flow — taste gates should **shrink** over time, not grow.

**NOT taste calls (auto-flow, agents ship):**

- chores (e.g. update product screenshots), dependency updates, version bumps
- bug fixes / fixing something broken; restoring a previously-approved design
- aligning UX to existing guardrails / design tokens / System B
- default-yes guardrail work: more-performant, more-secure, fewer-bugs, more-accessible, on-grid, not-slop, token-correct
- admin/internal tooling with no user-facing taste surface

**Backstop:** the `Taste Label Guard` workflow removes a taste label from any PR
whose conventional-commit type is `chore` / `deps` / `build` / `ci` / `fix` /
`refactor` / `test` / `docs` / `perf` / `style` / `revert` **unless** the PR
carries an explicit `ux:material` marker. `feat` and untyped titles keep the
label (a feature can be a material UX change). `needs:human` is separate and
unchanged: a physical action only a human can do (sign agreement, rotate key,
flip a dashboard toggle).

## Labels (canonical)

| Label | Meaning |
|-------|---------|
| `needs-human-taste` | Human required for **taste** only |
| `approved:taste` / `tim-approved` | Taste override — does not bypass CI |
| `hold` / `gated` | Explicit pause (incident, experiment) |
| `needs-agent-fix` | Machine second-opinion/spec failed — **agent** fixes, not human review queue |
| `merge-queue` | Enrolled in Graphite MQ |

**Deprecated for dev-loop gating:** `needs-human` as a generic blocker; `blocked:migration`, `blocked:auth`, `blocked:payments` as human-merge gates (use CI instead).

## References

- `~/.claude/CLAUDE.md` §2 Shipping Philosophy
- `~/.hermes/scripts/lib/pr_gates.py`
- `~/.hermes/scripts/pr-merge-queue.py`
- `Jovie/scripts/drain-pr-queue.sh`
- `Jovie/.github/MERGE_QUEUE.md`