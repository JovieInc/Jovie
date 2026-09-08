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
- `scripts/taste-classifier.mjs` — taste-touching diffs route to stronger LLM review and post-landing certification without a human hold
- GitHub native merge queue (authoritative queue state only; no `merge-queue`
  label), squash, and the repository ruleset
- Hermes `pr-autofix`, `drain-pr-queue`, `pr-merge-queue` (when `HERMES_AUTOMERGE=1`)

## What counts as a taste call (canonical, 2026-06-26)

Mark a change `ux:material` only when it makes a material subjective UX or
visual judgment. The marker routes stronger automated review and a post-landing
certification task; it never pauses the PR.

**NOT taste calls (auto-flow, agents ship):**

- chores (e.g. update product screenshots), dependency updates, version bumps
- bug fixes / fixing something broken; restoring a previously-approved design
- aligning UX to existing guardrails / design tokens / System B
- default-yes guardrail work: more-performant, more-secure, fewer-bugs, more-accessible, on-grid, not-slop, token-correct
- admin/internal tooling with no user-facing taste surface

Physical or external actions such as signing an agreement, rotating a key, or
flipping a provider setting ship disabled and are tracked as separate
post-landing authority actions.

### Authority provenance before containment

Before proposing a rollback, containment, or admission denial from an older
plan, re-read the latest relevant user direction and bind it to the exact scope,
owner, and any superseded instruction. Unknown provenance is an investigation
state, not evidence that approval is missing. Preserve a later authorized
production cutover and a bounded authorized restart; escalate a newly observed
safety failure, such as a retry storm beyond that bound, to the sole runtime
owner.

## Labels (canonical)

| Label | Meaning |
|-------|---------|
| `ux:material` | Stronger automated taste review plus post-landing certification |
| `hold` / `gated` | Explicit pause (incident, experiment) |
| `needs-agent-fix` | Machine second-opinion/spec failed — **agent** fixes, not human review queue |
| ~~`merge-queue`~~ | Retired. Does not enroll. Native GitHub queue membership is the only signal. |

**Retired and automatically removed:** `needs-human`, `human-review-required`,
`no-auto`, `no-auto-merge`, and `no-automerge`. Use machine gates for code and a
separate post-landing authority action for external side effects.

## References

- `~/.claude/CLAUDE.md` §2 Shipping Philosophy
- `~/.hermes/scripts/lib/pr_gates.py`
- `~/.hermes/scripts/pr-merge-queue.py`
- `Jovie/scripts/drain-pr-queue.sh`
- `Jovie/.github/MERGE_QUEUE.md`
