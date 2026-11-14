import { existsSync, statSync } from 'node:fs';
import { livenessFingerprint } from './automation-registry.mjs';

/**
 * A restore that failed left no usable state file behind (JOV-9641, extended
 * JOV-9006): either the `--previous` path is missing, or the workflow's
 * restore step — `unzip -p liveness/prior.zip state.json > liveness/state.json
 * 2>/dev/null || true` — created a 0-byte file when the artifact listing hit an
 * installation-budget 403 behind `|| true` (observed 2026-11-14T13:00:28Z on
 * run 43597514138: `gh api` printed the 403 body into `$id`, the zip download
 * failed, and the bare `>` redirect still truncated the target into existence).
 * An empty file parses as no state at all, so it must reconcile like a missing
 * one, not count as a successful restore.
 */
function restoredStateFile(path) {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    // A file that vanished mid-check is not a restored state; reconcile.
    return false;
  }
}

/**
 * Decision-time previous alert state, reconciling a lost restore (JOV-9641).
 *
 * The liveness workflow restores the previous alert state from an Actions
 * artifact, and the restore step swallows GitHub API failures (`|| true`), so an
 * installation-budget 403 can leave a filing run with no persisted state at
 * all — or, worse, with a 0-byte state file the redirect created, which a bare
 * existsSync check misreads as a restored state (JOV-9006: the 12:59 run after
 * the gem:lanes-tick red dropped the red -> green resolution and persisted a
 * state rebuilt from nothing, stranding the open alert). That run must not mark
 * every fingerprint green: a critical row with no recorded state reads as red
 * (an alert may be open and unproven), so a recovered loop resolves its open
 * Linear alert — `livenessDecisions` fires the green resolution on red — and a
 * failed apply already persists the decision-time state for the next run to
 * retry.
 */
export function lostStatePrevious(args, report, previous = {}) {
  if (!args?.previous || restoredStateFile(args.previous)) return previous;
  const reconciled = { ...previous };
  for (const row of report?.results ?? []) {
    if (!row?.critical) continue;
    const fingerprint = livenessFingerprint(row.id);
    if (reconciled[fingerprint] === undefined) reconciled[fingerprint] = 'red';
  }
  return reconciled;
}
