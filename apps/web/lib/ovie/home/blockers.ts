/**
 * In Flight for Home: why work is stuck, not a wall of cards. Groups the
 * operational tasks that are blocked or failing by the check that holds
 * them, with counts and the PRs behind each reason. Work moving normally
 * collapses to one count; Tim cannot act on those cards, so Home does not
 * list them (coordinator review, 2026-10-31).
 */

import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OperationalTask =
  ShippingCockpitProjection['operationalTasks']['tasks'][number];

export interface OvieBlockerPr {
  readonly id: string;
  readonly label: string;
  readonly url: string | null;
}

export interface OvieBlockerGroup {
  readonly reason: string;
  /** Distinct PRs held by this reason. */
  readonly count: number;
  readonly prs: readonly OvieBlockerPr[];
}

export interface OvieInFlightSummary {
  readonly total: number;
  readonly stuck: number;
  readonly moving: number;
  readonly groups: readonly OvieBlockerGroup[];
}

/** Collapse sharded and per-run check names into the reason a person reads. */
export function blockerReason(check: string): string {
  const name = check.trim();
  if (/^jovie-execution\//i.test(name)) return 'Agent execution check';
  if (/^Affected Unit Tests\b/i.test(name)) return 'Unit tests';
  if (/^Private data guard\b/i.test(name)) return 'Private data guard';
  return name.replace(/\s*\(\d+\/\d+\)\s*$/, '') || 'Unknown check';
}

function isStuck(task: OperationalTask): boolean {
  return (
    task.workflowState === 'blocked' ||
    task.workflowState === 'retrying' ||
    task.pullRequest?.checks.rollup === 'failure'
  );
}

function reasonsFor(task: OperationalTask): readonly string[] {
  const failing = task.pullRequest?.checks.failing ?? [];
  const reasons = [...new Set(failing.map(blockerReason))];
  if (reasons.length > 0) return reasons;
  if (task.workflowState === 'retrying') return ['Retrying'];
  return ['Blocked, no failing check named'];
}

/**
 * Each stuck PR lands in exactly one group, its most common reason across
 * the board, so the groups sum to the stuck count. Reasons past `maxGroups`
 * fold into "Other reasons".
 */
export function buildInFlightSummary(
  tasks: readonly OperationalTask[],
  maxGroups = 5
): OvieInFlightSummary {
  const open = tasks.filter(
    task => task.workflowState !== 'production-verified'
  );
  const stuck = open.filter(isStuck);
  const frequency = new Map<string, number>();
  for (const task of stuck)
    for (const reason of reasonsFor(task))
      frequency.set(reason, (frequency.get(reason) ?? 0) + 1);
  const byReason = new Map<string, OvieBlockerPr[]>();
  for (const task of stuck) {
    const primary = [...reasonsFor(task)].sort(
      (a, b) =>
        (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0) || a.localeCompare(b)
    )[0] as string;
    const list = byReason.get(primary) ?? [];
    list.push({
      id: task.id,
      label: task.pullRequest
        ? `#${task.pullRequest.number} ${task.title}`
        : `${task.linearIdentifier} ${task.title}`,
      url: task.pullRequest?.url ?? task.linearUrl,
    });
    byReason.set(primary, list);
  }
  const ranked = [...byReason.entries()]
    .map(([reason, prs]) => ({ reason, count: prs.length, prs }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  const groups: OvieBlockerGroup[] = ranked.slice(0, maxGroups);
  const rest = ranked.slice(maxGroups);
  if (rest.length > 0) {
    const prs = rest.flatMap(group => group.prs);
    groups.push({
      reason: `Other reasons (${rest.length})`,
      count: prs.length,
      prs,
    });
  }
  return {
    total: open.length,
    stuck: stuck.length,
    moving: open.length - stuck.length,
    groups,
  };
}
