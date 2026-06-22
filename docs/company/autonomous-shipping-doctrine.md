# Autonomous Shipping Doctrine (Jovie Technology Inc.)

**Effective:** 2026-06-22  
**Status:** Company policy — overrides informal “ask Tim before merge” habits.

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
- Graphite merge queue (`merge-queue` label), squash, signed commits per ruleset
- Hermes `pr-autofix`, `drain-pr-queue`, `pr-merge-queue` (when `HERMES_AUTOMERGE=1`)

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