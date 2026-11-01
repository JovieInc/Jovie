// Single source of truth for "may CI delete this Neon branch?".
//
// Every Neon branch deleter (scheduled cleanup, PR-close cleanup, orphan
// reaper) must pass a branch through `evaluateBranchDeletion` using the live
// Neon API record, not a caller-supplied name list. The decision fails closed:
// unreadable flags, unknown branches and reserved names are all "keep".
//
// Never deletable, regardless of who calls:
//   - the project's default branch (Neon `default: true`)
//   - any protected branch (Neon `protected: true`)
//   - production / prod / main (any case), plus the legacy br-main / br-production
//   - backup-* branches (manual /neon-backup snapshots)

export const RESERVED_BRANCH_NAMES = Object.freeze([
  'production',
  'prod',
  'main',
  'master',
  'br-main',
  'br-production',
]);

const BACKUP_RE = /^backup([-_.]|$)/i;

export function isReservedBranchName(name) {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return true; // an empty name is never a deletion target
  return (
    RESERVED_BRANCH_NAMES.includes(normalized) || BACKUP_RE.test(normalized)
  );
}

/**
 * @param {{ name?: string, id?: string, default?: unknown, protected?: unknown } | null | undefined} branch
 *   A branch record exactly as returned by the Neon API.
 * @returns {{ deletable: boolean, reason: string }}
 */
export function evaluateBranchDeletion(branch) {
  if (!branch || typeof branch !== 'object' || !branch.name || !branch.id) {
    return { deletable: false, reason: 'branch-record-unreadable' };
  }
  if (isReservedBranchName(branch.name)) {
    return { deletable: false, reason: 'reserved-name' };
  }
  // Both flags must be present booleans: an API change or partial payload must
  // never be read as "not protected".
  if (
    typeof branch.default !== 'boolean' ||
    typeof branch.protected !== 'boolean'
  ) {
    return { deletable: false, reason: 'protection-flags-unreadable' };
  }
  if (branch.default) return { deletable: false, reason: 'default-branch' };
  if (branch.protected) return { deletable: false, reason: 'protected-branch' };
  return { deletable: true, reason: 'ephemeral' };
}

/** Look a branch up by name in a Neon API branch list and evaluate it. */
export function evaluateBranchNameAgainstInventory(branches, name) {
  if (!Array.isArray(branches)) {
    return { deletable: false, reason: 'inventory-unreadable' };
  }
  if (isReservedBranchName(name)) {
    return { deletable: false, reason: 'reserved-name' };
  }
  const matches = branches.filter(branch => branch?.name === name);
  if (matches.length !== 1) {
    return {
      deletable: false,
      reason: matches.length === 0 ? 'not-in-inventory' : 'ambiguous-name',
    };
  }
  return evaluateBranchDeletion(matches[0]);
}
