import { existsSync } from 'node:fs';
import { livenessFingerprint } from './automation-registry.mjs';

/**
 * Decision-time previous alert state, reconciling a lost restore (JOV-9641).
 *
 * The liveness workflow restores the previous alert state from an Actions
 * artifact, and the restore step swallows GitHub API failures (`|| true`), so an
 * installation-budget 403 can leave a filing run with no persisted state at
 * all. That run must not mark every fingerprint green: a critical row with no
 * recorded state reads as red (an alert may be open and unproven), so a
 * recovered loop resolves its open Linear alert — `livenessDecisions` fires
 * the green resolution on red — and a failed apply already persists the
 * decision-time state for the next run to retry.
 */
export function lostStatePrevious(args, report, previous = {}) {
  if (!args?.previous || existsSync(args.previous)) return previous;
  const reconciled = { ...previous };
  for (const row of report?.results ?? []) {
    if (!row?.critical) continue;
    const fingerprint = livenessFingerprint(row.id);
    if (reconciled[fingerprint] === undefined) reconciled[fingerprint] = 'red';
  }
  return reconciled;
}
