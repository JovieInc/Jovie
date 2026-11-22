/**
 * Open-PR listing for the Summer no-stall sweep.
 *
 * One `gh pr list` that asks for statusCheckRollup on 100 PRs at once times
 * out at GitHub's GraphQL gateway (504) and capped the sweep at 100 PRs. The
 * list call now carries only light fields with no 100 cap, and the rollup is
 * read per PR, only where the classifier needs it. A failed rollup read
 * leaves that PR without one, which the classifier treats as not green.
 */

/** @typedef {(args: string[]) => any} GhJson */

export const LIST_FIELDS =
  'number,title,isDraft,author,headRefName,updatedAt,url,labels,mergeable,mergeStateStatus,autoMergeRequest,isCrossRepository,headRepository';
export const LIST_LIMIT = 1000;
/** Keeps the run inside its declared 8-call token budget (two list pages + six reads). */
export const MAX_ROLLUP_READS = 6;

/**
 * The classifier only acts on checks for ready, conflict-free, same-repo PRs
 * whose owner went idle, so only those get a rollup read.
 * @param {{ isDraft?: boolean, mergeable?: string | null, isCrossRepository?: boolean, updatedAt?: string }} pr
 * @param {{ idleHours?: number, nowMs?: number }} [opts]
 */
export function needsRollup(pr, opts = {}) {
  const idleMs = (opts.idleHours ?? 0) * 3_600_000;
  const updated = Date.parse(String(pr.updatedAt ?? ''));
  return (
    pr.isDraft !== true &&
    pr.isCrossRepository !== true &&
    String(pr.mergeable ?? '').toUpperCase() === 'MERGEABLE' &&
    (!Number.isFinite(updated) ||
      (opts.nowMs ?? Date.now()) - updated >= idleMs)
  );
}

/**
 * @param {GhJson} ghJson the caller's gh wrapper (pr-no-stall.mjs owns the subprocess)
 * @param {{ idleHours?: number, nowMs?: number }} [opts]
 * @returns {{ prs: any[], rollupErrors: number, rollupSkipped: number }}
 */
export function listOpenPrs(ghJson, opts = {}) {
  const prs = ghJson([
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    String(LIST_LIMIT),
    '--json',
    LIST_FIELDS,
  ]);
  // lane-fix-red heads are the deadlock candidates, so they read first, oldest first.
  const red = pr =>
    (pr.labels ?? []).some(l => (l?.name ?? l) === 'lane-fix-red');
  const candidates = prs
    .filter(pr => needsRollup(pr, opts))
    .sort(
      (a, b) =>
        Number(red(b)) - Number(red(a)) ||
        String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? ''))
    );
  let rollupErrors = 0;
  for (const pr of candidates.slice(0, MAX_ROLLUP_READS)) {
    try {
      const view = ghJson([
        'pr',
        'view',
        String(pr.number),
        '--json',
        'statusCheckRollup',
      ]);
      pr.statusCheckRollup = view.statusCheckRollup;
    } catch {
      rollupErrors += 1;
    }
  }
  return {
    prs,
    rollupErrors,
    rollupSkipped: Math.max(0, candidates.length - MAX_ROLLUP_READS),
  };
}
