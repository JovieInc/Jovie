---
paths: [".github/**", "scripts/ci-*", "scripts/lib/ci-*"]
---

# CI Branching (24/7 Agent Development)

> **Default is small sibling PRs straight to `main`** — see the canonical
> [`docs/PR_FLOW.md`](../../docs/PR_FLOW.md). The integration-branch / train model
> below is an **option** for a coordinated multi-agent wave on one domain, not the
> default. Reach for it only when >3 agents touch the same domain in the same
> window; otherwise ship direct-to-main and let the queue parallelize.

Canonical branching policy for parallel agent work. Supplements [`.claude/rules/release.md`](release.md) PR discipline and [`.claude/rules/swarm.md`](swarm.md) swarm coordination.

## Architecture

```text
Parallel agents → integration/loop-{domain} (fast verify, squash immediately)
                → train PR → main (one full CI per domain batch)
                → merge queue (combined-head fast + unit/build/layout) → deploy
```

**Throughput:** ~20 agent PRs via integration trains ≈ **4 full CI builds** instead of **40+** when every agent PR targets `main` directly.

## Branch taxonomy

| Branch type | Pattern | CI on PR | Merge target |
|-------------|---------|----------|--------------|
| **Feature (agent)** | `tim/jov-XXXX`, `agent/jov-XXXX`, `linear/*`, `claude/*`, `codex/*` | Integration fast only | `integration/loop-*` |
| **Integration** | `integration/loop-{domain}` | `Integration Fast` (optional) | Absorbs feature PRs |
| **Train** | `integration/loop-{domain}` → `main` PR | deterministic `PR Ready`; manual deep evidence only when explicitly needed | `main` |
| **Hotfix** | `hotfix/jov-XXXX` | deterministic `PR Ready`; merge-group next-level gate | `main` (bypass integration) |
| **Dependabot** | `dependabot/*` | Full CI; batch merge Mondays | `main` |
| **Human ad-hoc** | any | Full CI | `main` (discouraged for agents) |

## Integration domains

| Branch | Owns |
|--------|------|
| `integration/loop-auth` | Clerk, proxy, entitlements, sign-in |
| `integration/loop-ui` | Design system, dashboard chrome, surfaces |
| `integration/loop-library` | Library, uploads, waveforms, share drops |
| `integration/loop-chat` | Chat, shell audio, messaging |
| `integration/loop-infra` | CI, scripts, hooks, agent control plane |

After a train merges to `main`, reset the integration branch from `main` before the next wave.

## Hard rules for agents

1. **Default is a small sibling PR straight to `main`** (see header note +
   `docs/PR_FLOW.md`). Target `integration/loop-{domain}` only inside a
   coordinated multi-agent wave (>3 agents, one domain, same window).
2. **One PR = one Linear issue** — no drive-by refactors.
3. **PR labels never allocate heavyweight CI.** Use a hosted manual/scheduled/event lane when deep evidence is explicitly required.
4. **Local verify before integration merge:** `typecheck`, `biome`, focused `vitest`.
5. **Train PRs to `main` only from lead/orchestrator** — coders use `scripts/loop-integration-ship.sh`.
6. **Max 5 open PRs per integration branch** — open a train when the batch is full or the domain is idle.
7. **Stale PR >24h without push** — close and recreate from fresh integration base.
8. **One migration number per train** — rebase integration before adding the next `00NN_*` migration.

## Event-driven only: no new controllers, clocks, or pollers (JOV-INV-042)

Admission and landing (PR ready/draft, auto-merge, merge-queue enqueue/dequeue,
PR/issue labels, Linear state) are event-driven. The Gem lanes tick
(`scripts/lanes/`) is the only scheduler.

- Check existing machinery first: extend merge-queue-green-enroll, the hold
  contract, or the lanes tick before adding any controller.
- New controllers trigger on `pull_request`, `pull_request_target`,
  `merge_group`, `workflow_run`, `check_suite`, or `repository_dispatch`, or
  extend the Gem tick. Never a cron.
- Cron is only for measurement and scans already on the frozen
  `CRON_ALLOWLIST` in `scripts/lib/ci-schedule-inventory.mjs`. The allowlist,
  `ADMISSION_CRON_DEBT`, and `POLLING_DEBT` only shrink: removing a cron deletes
  its entry and lowers the ceiling.
- Never hold a runner polling GitHub, git, or queue state. React to the
  completion event. A capped retry (at most 5 attempts) of one transient call
  is the only allowed wait.

## When to use integration branches

| Use integration | Go direct to `main` |
|-----------------|---------------------|
| Parallel agent waves (3+ issues, same domain) | Single-issue production hotfix |
| UI / library / chat batches | Security patch needing immediate full gate |
| Any work while >10 open PRs target `main` | Human-reviewed product decision PR |
| Migrations batched per domain | Infra PR that *is* the CI fix (e.g. merge-queue slim) |

**Decision rule:** If another agent might touch the same domain in the next 4 hours → integration branch.

## Exemptions (may target `main`)

- `hotfix/*` branches
- `train/*` or integration→main train PRs
- Orchestrator-owned PRs that target `main` by design
- Dependabot / `screenshots/*` automation
- Workflow PRs that change CI itself (orchestrator-owned)

## Orchestration artifacts

| Artifact | Purpose |
|----------|---------|
| `.context/loop-state.json` | Active integration bases, waves, train PRs |
| `scripts/loop-integration-ship.sh` | Fast ship feature branch → integration |
| GitHub native merge queue | Validate combined heads after normal Merge when ready |
| `scripts/loop-train-drain.sh` | Rebase train PRs, auto-merge when CLEAN |

## Enforcement

- **Local:** `pnpm ci:branching-guard --head <branch> --base main` before opening agent PRs.
- **Harness:** `pnpm ci:branching-guard:validate` in Structural Contract lane.

**Ship now:** warn mode for agent PRs → `main` — kept past the original
2026-06-17 trigger because direct-to-`main` sibling PRs became the documented
default (`docs/PR_FLOW.md`, 2026-06-22 post-mortem); error mode would fight the
canonical flow. **Re-evaluate when:** integration-branch waves become the
default again. **Then:** escalate to error mode.

## Gate-weakening detector (JOV-INV-045)

`gate-weakening-detector` is a blocking `prOnly` source guard. On
`pull_request` it diffs `origin/<base>...HEAD` and fails when that diff loosens
required checks, branch protection, PR Ready needs, Source Validation steps, or
source-guard ids; grows a shrink-only baseline or allowlist; loosens a coverage
or budget threshold; adds a skip, exclusive test, suppression, or ignore entry;
deletes or empties an invariant test; or raises a CI timeout or retry. Demoting
a blocking guard to advisory, `continue-on-error`, or `if: false` fails too.

Override is never silent. The PR body needs a `gate-change: <reason>` line and
the `codeowners-approved` label, which is a machine-checked audit record applied by the authoring agent after the strong LLM review (`internal-review`); no person approves it (EVENT 2026-10-28).
Findings still print. Local run:
`node scripts/invariants/gate-weakening-detector.mjs --check`. Do not remove it
from `SOURCE_GUARDS` or mark it advisory.

## Open PRs with `pnpm pr:open`

`pnpm pr:open open` opens a PR; `draft [N]` drafts, `check --body-file f` validates,
and `update N` repairs N from its own diff. Drafting recovers PR/issue metrics and red CI URLs,
then asks once for missing `--metric`, `--failing-command`, `--failing-run` or `--failing-log`.
Blast radius severity matches CI; main's classifier reports unmapped paths as pending.
Updates guard PR references (body files need N's URL or `<!-- pr-open-target: JovieInc/Jovie#N -->`)
and confirm fresh validation runs via real edits. Verdicts: `~/.local/state/jovie-lanes/pr-open.jsonl`.

## Preflight before every push

Run `pnpm preflight:changed` before every push (JOV-9727; also in the pre-push
gate). It scopes to the diff vs `origin/main` and runs, in about a minute,
every rule CI would otherwise teach one 20-40 minute round at a time: generators
(topology, harness docs; written, not just checked), the Source Validation
guards selected by path (private-data, external-api, gate-weakening,
metrics-layer, ownership/registries, script contracts), the customer-changelog
marker, Migration Guard, changed-line coverage, biome, and typecheck of only the
affected packages under a heap cap (`JOVIE_PREFLIGHT_HEAP_MB`, default 4096).
It lints the PR body (`--body-file f`, `--pr N`, or the open PR) and prints a
filled template for any missing section (Red-before-green, Blast radius,
Locked areas, changelog marker), plus a checklist of companion edits for new
workflows, scripts, tests and migrations. `--thorough` adds heavy guards,
`--no-coverage` / `--no-typecheck` trim it, `JOVIE_PREFLIGHT_CHANGED=0` skips
the hook only. Commit first: coverage and the private-data guard read commits.
Every run appends to `~/.local/state/jovie-lanes/preflight-changed.jsonl`; CI
rounds per merged PR (target <= 1.3) and the Source Validation first-push pass
rate are in the shipping SLO report.

`pnpm preflight` below is the broader pass over the Source Validation job.


Run `pnpm preflight` before every push (workers: every push, no exceptions; the
pre-push gate also runs it, so do not bypass hooks). It derives its plan from
the `deterministic` job of `.github/workflows/source-validation.yml`, runs each
statement on its own, and lists all failures in one pass: typecheck of affected
packages, `lint:eslint:changed`, screen registry, census, nav and manifest
registrations, component-ship-gate, ratchets and baselines. Add
`--body-file <path> --title <title>` to lint the PR body (changelog marker,
Red-before-green, Blast radius, Locked areas). `pnpm preflight --list` prints the
plan. `pnpm ci:rounds` reports CI rounds (Source Validation head commits) per
merged PR as p50/p95; the goal is to drive the p50 toward 1.
