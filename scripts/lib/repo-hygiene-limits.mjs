const MiB = 1024 * 1024;

export const HYGIENE_LIMITS = Object.freeze({
  maxFileBytes: 10 * MiB,
  maxChangedBytes: 60 * MiB,
  maxBinaryBytes: 10 * MiB,
  maxChangedBinaryBytes: 60 * MiB,
  maxChangedBinaryFiles: 120,
  maxSnapshotBytes: 12 * MiB,
  // Raised 100 -> 110 (+10%, the documented per-raise cap): origin/main sat
  // exactly at 100, so any new visual-regression page coverage blocked the
  // size guard. Combined with pruning 10 orphaned baselines whose slugs were
  // removed from admin-surface-manifest.ts (JOV-4326 consolidation), the tree
  // measures 106 files (~8.7 MiB of the unchanged 12 MiB byte budget).
  maxSnapshotFiles: 110,
  // Raised 180 -> 198 MiB (+10%, the documented per-raise cap) under JOV-6635:
  // origin/main measured 178.14 MiB (99.0% of budget), blocking every PR that
  // adds tracked bytes. Measurements in docs/ci/repository-health.md.
  maxTrackedBytes: 198 * MiB,
  maxTrackedBinaryBytes: 96 * MiB,
});

// Early-warning threshold for the combined-tree tracked-bytes budget. The
// merge_group check ejects every queued PR once main + member crosses the
// budget, so surface shrinking headroom before it becomes a queue outage.
export const TRACKED_BYTES_WARNING_RATIO = 0.95;

export function trackedBytesBudgetWarning(
  bytes,
  maxTrackedBytes = HYGIENE_LIMITS.maxTrackedBytes
) {
  if (bytes <= maxTrackedBytes * TRACKED_BYTES_WARNING_RATIO) return null;
  const headroom = maxTrackedBytes - bytes;
  const percent = ((bytes / maxTrackedBytes) * 100).toFixed(2);
  const headroomText =
    headroom >= 0
      ? `${(headroom / 1_000_000).toFixed(2)} MB headroom`
      : `${(-headroom / 1_000_000).toFixed(2)} MB over budget`;
  return `tracked regular files total ${bytes} bytes (${percent}% of the ${maxTrackedBytes}-byte combined-tree budget; ${headroomText}); shrink tracked bytes before the merge queue starts ejecting PRs`;
}
