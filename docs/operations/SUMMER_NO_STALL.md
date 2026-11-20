# Summer PR no-stall ownership

Status: **policy locked** (Summer owns continuous reclaim; Cursor Projects do not)

Owner: Summer (company governor). Factory drain remains Symphony → Gem.
Executable: [`scripts/summer/pr-no-stall.mjs`](../../scripts/summer/pr-no-stall.mjs)
Workflow: [`.github/workflows/summer-pr-no-stall.yml`](../../.github/workflows/summer-pr-no-stall.yml)

## Decision

Open Jovie PRs must not stall because a Cursor cloud agent finished IDLE, a
queue-breaker `lane-fix-red` hold never saw a new head, or auto-ready never
fired. **Summer** continuously inventories and reclaims those orphans through
existing enroll / breaker / draft-ready paths.

A standing Cursor Project is **not** the watchdog. Projects remain an optional
accelerator under Summer's Cursor Projects policy (when present on main);
they never replace this duty.

## Failure class

Admission deadlock:

1. PR is ready (not draft) and required PR-time checks are green / mergeable.
2. `lane-fix-red` remains (usually `jovie-bot` queue-breaker hold).
3. Merge Queue Green Enroll will not admit while the label remains.
4. Relay clear only removes relay-applied (`github-actions[bot]`) reds.
5. Breaker release requires a **new head** (or superseded/shared evidence).
6. The Cursor/Gem owner went IDLE without pushing → permanent stall.

Secondary: draft + `lane-fix-green`/`lane-fix-stale` with idle owner; ready
agent PR idle without enroll progress.

## Summer duty

On every closure-health / bottleneck / catch-up turn that touches shipping:

1. Read or run `node scripts/summer/pr-no-stall.mjs --json`.
2. For `admission-deadlock`: reclaim with a bounded empty-head bump (or ensure
   the Summer workflow did), then let breaker release + green-enroll run.
3. For `draft-green-stale`: mark ready via existing auto-ready / `pnpm pr:open`
   writer proof — do not invent a second promoter.
4. For `tim-or-hold` (`hold`, `needs-outside-review`, `big-pr`, …): leave for Tim.
5. Never push `main`. Never open a Cursor Project solely to drain orphans.

## Executable path

| Path | Role |
| --- | --- |
| `scripts/summer/pr-no-stall.mjs` | Classify open PRs; optional `--apply` empty-head bumps (cap default 5) |
| `.github/workflows/summer-pr-no-stall.yml` | Push-to-main backstop + dispatch; Summer-accountable apply |
| `.github/workflows/agent-harness-health-report.yml` | Report includes `cursor/` and sibling agent prefixes |
| Merge Queue Green Enroll | Existing Summer enroll after hold release |
| Queue breaker | Releases `jovie-bot` holds on new head |

Event: main push and required-check completion already wake enroll. The missing
signal is **owner IDLE** (not a GitHub event), so the main-push backstop runs
the same classifier/apply path. No new paid model turn is required for apply.

## Non-goals

- Replacing lane-fix for conflicts / escalating reds that need real repairs
- Softening the breaker provenance gate (JOV-8492) without a new head
- Auto-creating Cursor Projects for stall sweeps
- Enabling `NOABANDON_ENABLED` (separate canary on `#26027`)

## Related

- Closure health stop-line: [`docs/PR_FLOW.md`](../PR_FLOW.md)
- Fleet roles: [`canon/FLEET.md`](../../canon/FLEET.md)
- No Unattended Red: `scripts/backlog-orchestrator/no-unattended-red.mjs`
- Summer identity: `apps/eve-pilot/identities/summer/instructions.md`
