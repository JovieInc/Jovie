/**
 * Stale remote-branch sweep policy (pure half).
 *
 * A remote branch is deleted only when nothing can be lost:
 * - contained: its tip is reachable from main (older than minContainedAgeDays,
 *   so a branch just cut from main by a live agent is left alone), or
 * - archived: its tip is first pushed to refs/archive/<branch> (and is often
 *   also a refs/pull/<n>/head), the archive ref is read back, and only then is
 *   the branch deleted with a lease on the planned SHA. Unique work must be
 *   idle for minUniqueAgeDays.
 *
 * Never swept: main, merge-queue branches, hostops backups (backup/**, owned by
 * scripts/lanes/worktree_sweep.py), release/develop/production branches,
 * Dependabot, branches with an open PR (by name or tip SHA), and caller-listed
 * branches (for example ones checked out in a local worktree).
 *
 * Restore: git push origin refs/archive/<branch>:refs/heads/<branch>
 */

export const SWEEP_SCHEMA = 'jovie-stale-branch-sweep/v1';
export const ARCHIVE_PREFIX = 'refs/archive/';
export const DEFAULT_POLICY = Object.freeze({
  minContainedAgeDays: 3,
  minUniqueAgeDays: 14,
});
export const PROTECTED_BRANCHES = Object.freeze([
  'main',
  'develop',
  'staging',
  'production',
  'gh-pages',
  '_production-deploy-hook-only',
]);
export const PROTECTED_PREFIXES = Object.freeze([
  'gh-readonly-queue/',
  'backup/',
  'release/',
  'dependabot/',
]);

const DAY_MS = 86_400_000;

export function isProtectedBranch(name) {
  return (
    PROTECTED_BRANCHES.includes(name) ||
    PROTECTED_PREFIXES.some(prefix => name.startsWith(prefix))
  );
}

/**
 * @param {{
 *   branches: Array<{ name: string, sha: string, committedAtMs: number }>,
 *   mainAncestors: Set<string>,
 *   pullHeads: Map<string, string>,
 *   openPullRequests: Array<{ headRefName: string, headRefOid: string }>,
 *   keepBranches?: Iterable<string>,
 *   nowMs: number,
 *   policy?: { minContainedAgeDays: number, minUniqueAgeDays: number },
 * }} input
 */
export function planBranchSweep({
  branches,
  mainAncestors,
  pullHeads,
  openPullRequests,
  keepBranches = [],
  nowMs,
  policy = DEFAULT_POLICY,
}) {
  const openNames = new Set(openPullRequests.map(pr => pr.headRefName));
  const openShas = new Set(openPullRequests.map(pr => pr.headRefOid));
  const keep = new Set(keepBranches);
  const items = branches.map(({ name, sha, committedAtMs }) => {
    const ageDays = (nowMs - committedAtMs) / DAY_MS;
    const base = {
      name,
      sha,
      ageDays: Math.round(ageDays * 10) / 10,
      pullRequest: pullHeads.get(sha) ?? null,
    };
    if (isProtectedBranch(name))
      return { ...base, action: 'keep', reason: 'protected-class' };
    if (openNames.has(name) || openShas.has(sha))
      return { ...base, action: 'keep', reason: 'open-pull-request' };
    if (keep.has(name))
      return { ...base, action: 'keep', reason: 'caller-keep' };
    if (mainAncestors.has(sha))
      return ageDays >= policy.minContainedAgeDays
        ? { ...base, action: 'delete', reason: 'contained-in-main' }
        : { ...base, action: 'keep', reason: 'contained-but-recent' };
    if (ageDays < policy.minUniqueAgeDays)
      return { ...base, action: 'keep', reason: 'unique-recent' };
    return {
      ...base,
      action: 'archive-delete',
      reason: base.pullRequest ? 'pull-head-preserved' : 'unique-no-pull',
      archiveRef: `${ARCHIVE_PREFIX}${name}`,
    };
  });
  const counts = {};
  for (const item of items) {
    const key = `${item.action}:${item.reason}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { schema: SWEEP_SCHEMA, policy, counts, items };
}

/** Deletable items whose archive (when required) was read back at the planned SHA. */
export function verifiedDeletions(items, archivedRefs) {
  return items.filter(
    item =>
      item.action === 'delete' ||
      (item.action === 'archive-delete' &&
        archivedRefs.get(item.archiveRef) === item.sha)
  );
}

export function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size)
    out.push(list.slice(index, index + size));
  return out;
}
