# Backlog orchestrator / ownership inventory recovery runbook

**Subsystem:** `scripts/backlog-orchestrator/backlog-orchestrator.mjs` +
`scripts/backlog-orchestrator/ownership-inventory.mjs` +
`scripts/backlog-orchestrator/ownership-inventory.json` +
`scripts/backlog-orchestrator/runtime-state.mjs` +
`scripts/backlog-orchestrator/run-backlog.sh`

**Severity:** P0 when ownership inventory is corrupted, stale, or admission
routing fails, because autonomous intake cannot classify issues or route them to
the correct repository and verification authority.

**Owner:** on-call operator and the backlog orchestrator owner.

## Entry criteria

Enter this runbook when any of the following are true:

- `scripts/backlog-orchestrator/ownership-inventory.json` is missing, malformed,
  or has duplicate system IDs.
- `scripts/backlog-orchestrator/backlog-orchestrator.mjs reconcile --dry-run`
  crashes or emits `reconciliation-mutation-failed`,
  `ownership-readback-missing-or-mismatched`, or `reconciliation-snapshot-changed`.
- Runtime cache or shadow report files appear inside the git tree
  (`.orchestrator-cache.json` or `shadow-report-latest.txt` under
  `scripts/backlog-orchestrator/`).
- Admission targeting consistently fails with `no-jovie-artifact`,
  `ownership-ambiguous`, or missing `target_system` / `target_repo` /
  `artifact` / `verification_authority` fields.
- The agent-ready triage watchdog reports `status: "blocked"` with issues stuck
  in Triage for more than five minutes.
- Linear API calls fail with `RATE_LIMITED` or `PAGE_FETCH_FAILED` and the
  orchestrator cannot make progress.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- `ownership-inventory.json` loads with schema `jovie-ownership-inventory/v1`
  and unique system IDs.
- `reconcile --dry-run` completes without fatal errors.
- No orchestrator cache or report files are tracked inside the git tree.
- Admission receipts contain all four required target fields.
- Any action taken to restore the inventory or cache is confirmed idempotent
  (re-running validation does not re-report the same error).
- The recovery lane has not admitted any product, credential, or migration work
  outside the bounded scope of the inventory/orchestrator fix.

## 1. Safe stop / kill switch

Cancel any running backlog orchestrator process before inspecting or mutating
inventory, cache, or Linear state. If a wrapper script or cron job is driving
the orchestrator, stop it. The orchestrator has no dedicated launchd unit on
Hermes-Air; admission is event-driven through Linear issue/label/comment changes
and the `run-backlog.sh` wrapper.

```bash
pkill -f 'backlog-orchestrator.mjs'
```

Use `pkill` only when the orchestrator is actively causing harmful mutations
(for example, repeatedly writing invalid classification comments). The
orchestrator never force-merges PRs, bypasses the merge queue, or deploys.

Do not manually move issues to `Todo` or `In Progress` during recovery.

## 2. Inspect current state and blast radius

Validate the ownership inventory:

```bash
cd "$JOVIE_REPO"
node -e "import('./scripts/backlog-orchestrator/ownership-inventory.mjs').then(m => console.log(JSON.stringify(m.loadOwnershipInventory(), null, 2)))"
```

Check the inventory file directly:

```bash
cat scripts/backlog-orchestrator/ownership-inventory.json
python3 -m json.tool scripts/backlog-orchestrator/ownership-inventory.json
```

Check for cache/report files inside the git tree:

```bash
git status --short | grep -E '\.orchestrator-cache|shadow-report-latest'
```

Check the default runtime cache location:

```bash
cat ~/.cache/jovie/.orchestrator-cache.json 2>/dev/null | head -c 2000
```

Run a dry-run reconcile to see current classification behavior:

```bash
bash scripts/backlog-orchestrator/run-backlog.sh reconcile --dry-run
```

Inspect Linear backoff state if rate-limiting is suspected:

```bash
ls -la "${LINEAR_BACKOFF_STATE_DIR:-$HOME/.cache/jovie/linear-backoff}"
```

Interpret the blast radius:

| Symptom | Likely impact |
|---|---|
| Inventory schema mismatch | All admission targeting fails; issues cannot be routed to a repo. |
| Duplicate system IDs | Admission resolution is non-deterministic; wrong owner may be selected. |
| Cache inside git tree | `gem-priority-gate` and other no-LLM planes fail closed; the tree is dirty. |
| Reconcile snapshot changed | Another owner or process is racing the orchestrator on the same issue. |
| `no-jovie-artifact` | The issue is not owned by Jovie or lacks a Jovie artifact; verify reroute to `JovieInc/summer-config` or `JovieInc/Ops`. |
| `ownership-ambiguous` | The description does not contain enough ownership evidence; fix the issue, not the inventory. |
| Rate-limit cooldown | The orchestrator cannot page Linear; wait for the cooldown or clear stale backoff files. |

## 3. Quarantine harmful work

During recovery:

- Do **not** manually transition Linear issues to bypass the orchestrator.
- Do **not** hand-edit `ownership-inventory.json` without first validating the
  schema and proving the file parses.
- Do **not** delete the runtime cache while a mutating orchestrator process is
  still running; stop it first.
- Do **not** use the recovery lane to bypass credential, security, migration,
  or consent gates.
- Flag any in-flight autonomous PRs as `on-hold` until admission targeting is
  healthy again.

## 4. Replay or resume safe work

If the runtime cache is inside the git tree, stop the orchestrator, remove the
in-tree file, and let the next run write to the default outside-tree location:

```bash
pkill -f 'backlog-orchestrator.mjs'
for f in .orchestrator-cache.json shadow-report-latest.txt; do
  rm -f "scripts/backlog-orchestrator/$f"
done
git status --short | grep -E '\.orchestrator-cache|shadow-report-latest'
```

If the inventory is corrupted, restore it from the current branch and validate
it before resuming:

```bash
git checkout HEAD -- scripts/backlog-orchestrator/ownership-inventory.json
node -e "import('./scripts/backlog-orchestrator/ownership-inventory.mjs').then(m => { const inv = m.loadOwnershipInventory(); const ids = inv.systems.map(s => s.id); if (new Set(ids).size !== ids.length) throw new Error('duplicate system ids'); console.log('inventory ok'); })"
```

If a stale Linear backoff is blocking the orchestrator, confirm the current
process is stopped and remove only the backoff files that are older than the
Linear reset timestamp reported in the error:

```bash
pkill -f 'backlog-orchestrator.mjs'
rm -f "${LINEAR_BACKOFF_STATE_DIR:-$HOME/.cache/jovie/linear-backoff}"/*
```

After clearing state, re-run a dry-run reconcile:

```bash
bash scripts/backlog-orchestrator/run-backlog.sh reconcile --dry-run
```

If the dry-run succeeds, resume normal event-driven admission by allowing the
wrapper to run again. Do not add a periodic timer; the orchestrator is
intentionally event-driven.

## 5. Reconcile ambiguous external effects

If the inventory loads correctly but issues still route incorrectly, the cause
is usually in the issue description or the admission evidence, not the
inventory:

- Check that the issue description contains a `## Proposed fix` section and,
  when needed, explicit target fields (`target_system`, `target_repo`,
  `artifact`, `verification_authority`).
- If `no-jovie-artifact` persists, confirm whether the issue should be routed to
  `JovieInc/summer-config` (Summer runtime policy) or `JovieInc/Ops` (company
  canon) rather than Jovie.
- If `ownership-ambiguous` persists, add clearer ownership evidence to the
  issue description and re-run reconcile; do not broaden the inventory
  heuristics.
- If admission targets collide, check the collision domains reported by
  `ownership-inventory.mjs` and ensure concurrent issues do not share the same
  artifact surface.

If the orchestrator is healthy but the Linear API is still failing, check
credential scope and rate-limit headers before repeating the run.

## 6. Restore / recover data

The ownership inventory is the durable source of truth in
`scripts/backlog-orchestrator/ownership-inventory.json`. Restore it from git if
it is corrupted or hand-edited:

```bash
git checkout HEAD -- scripts/backlog-orchestrator/ownership-inventory.json
```

The runtime cache and shadow report are transient. If you need to preserve
evidence, copy them before deleting:

```bash
cp ~/.cache/jovie/.orchestrator-cache.json \
   ~/.cache/jovie/.orchestrator-cache.json.$(date +%Y%m%d-%H%M%S)
cp ~/.cache/jovie/shadow-report-latest.txt \
   ~/.cache/jovie/shadow-report-latest.txt.$(date +%Y%m%d-%H%M%S)
```

Then delete the corrupted files and let the next orchestrator run recreate
them:

```bash
rm -f ~/.cache/jovie/.orchestrator-cache.json
rm -f ~/.cache/jovie/shadow-report-latest.txt
```

Backoff state in `LINEAR_BACKOFF_STATE_DIR` is also transient; clear it only
when the orchestrator is stopped and the Linear cooldown has passed.

## 7. Verify recovery completion

After any inventory or cache change, validate the exact runtime:

```bash
cd "$JOVIE_REPO"
node -e "import('./scripts/backlog-orchestrator/ownership-inventory.mjs').then(m => { const inv = m.loadOwnershipInventory(); if (inv.schema !== 'jovie-ownership-inventory/v1') throw new Error('bad schema'); const ids = inv.systems.map(s => s.id); if (new Set(ids).size !== ids.length) throw new Error('duplicate ids'); console.log('inventory valid'); })"
bash scripts/backlog-orchestrator/run-backlog.sh reconcile --dry-run
git status --short | grep -E '\.orchestrator-cache|shadow-report-latest' && exit 1 || echo 'tree clean'
```

Confirm all of the following:

- `loadOwnershipInventory()` returns schema `jovie-ownership-inventory/v1`.
- All system IDs are unique.
- `reconcile --dry-run` exits `0` and reports no fatal errors.
- The git tree contains no `.orchestrator-cache.json` or
  `shadow-report-latest.txt` files under `scripts/backlog-orchestrator/`.
- A sample admission receipt from the dry-run contains `target_system`,
  `target_repo`, `artifact`, and `verification_authority`.

## 8. Communicate affected-user scope

The backlog orchestrator has no direct user-facing surface, but stalled admission
routing delays new work entering the shipping pipeline. Post in `#alerts-critical`
using the format from `docs/ON_CALL_PROCESS.md`:

```text
[P0] Backlog orchestrator / ownership inventory stalled: <symptom>
Status: Monitoring | Resolved
Impact: Autonomous intake delayed; no direct user outage
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/backlog-orchestrator-ownership-inventory-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** operators with access to the orchestrator host,
  the `JovieInc/Jovie` checkout, and the Linear API key used by
  `run-backlog.sh`.
- **Audit:** keep shell history and the orchestrator stderr output. The
  orchestrator writes receipts to Linear issue comments and transient cache
  files; preserve copies before deleting them.
- **Break-glass:** if the inventory must be bypassed to route a critical issue,
  add explicit target fields to the issue description and rerun reconcile.
  Never hand-admit an issue by editing the inventory alone.
- **Safety invariant:** the orchestrator never force-merges PRs, bypasses the
  merge queue, or deploys. Any process claiming to be the recovery lane that
  asks for a force-merge, credential, or schema migration is an imposter.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/backlog-orchestrator-ownership-inventory-recovery.test.ts`.
The test checks that the runbook contains the required recovery sections, that
every repo-relative path it references exists, and that the ownership inventory
loads deterministically. If a command or path changes, update the runbook and
the test together in the same PR.

When you change the following files, update this runbook before merging:

- `scripts/backlog-orchestrator/backlog-orchestrator.mjs`
- `scripts/backlog-orchestrator/ownership-inventory.mjs`
- `scripts/backlog-orchestrator/ownership-inventory.json`
- `scripts/backlog-orchestrator/runtime-state.mjs`
- `scripts/backlog-orchestrator/run-backlog.sh`
- `scripts/symphony/launchd/README.md`
- `docs/ON_CALL_PROCESS.md`
