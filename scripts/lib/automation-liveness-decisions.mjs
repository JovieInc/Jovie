import { REGISTRY_PATH } from './automation-registry.mjs';
import { renderCapabilityRequest } from './capability-request.mjs';
import { renderQueueRecovery } from './merge-queue-recovery.mjs';

export function livenessFingerprint(id) {
  return `automation-liveness-${String(id)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}`;
}

/**
 * Alert decisions for the existing remediation-signal intake: one fingerprint
 * per critical loop, red while silent, green once its heartbeat returns.
 * `previous` maps fingerprint -> 'red'|'green' from the last run; a steady
 * green makes no Linear call.
 */
export function livenessDecisions(report, previous = {}) {
  const decisions = [];
  for (const row of report.results) {
    if (!row.critical || row.status === 'deferred') continue;
    const fingerprint = livenessFingerprint(row.id);
    if (row.recoveryWritable === false) {
      decisions.push({
        action: 'hold',
        fingerprint,
        id: row.id,
        reason: row.reason,
        detail: undefined,
      });
      continue;
    }
    if (row.status === 'fresh') {
      if (
        previous[fingerprint] === 'red' ||
        previous[fingerprint]?.status === 'red' ||
        row.recovery?.status === 'recovered'
      )
        decisions.push({
          action: 'green',
          fingerprint,
          id: row.id,
          ...(row.recovery
            ? { detail: renderQueueRecovery(row.recovery) }
            : {}),
        });
      continue;
    }
    decisions.push({
      action: 'red',
      fingerprint,
      id: row.id,
      detail: [
        `Automation \`${row.id}\` is ${row.status}: ${row.reason}.`,
        `Last heartbeat: ${row.lastProofAt ?? 'none'}; max silence ${row.budgetMinutes}m.`,
        `Escalation owner: ${row.escalationOwner}. Receipt: ${row.url ?? 'unknown'}.`,
        `Registry: ${REGISTRY_PATH}.`,
        ...(row.recovery?.capabilityRequests ?? []).map(
          renderCapabilityRequest
        ),
        ...(row.recovery ? [renderQueueRecovery(row.recovery)] : []),
      ].join('\n'),
    });
  }
  return decisions;
}
