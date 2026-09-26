const MiB = 1024 * 1024;

export const HYGIENE_LIMITS = Object.freeze({
  maxFileBytes: 10 * MiB,
  maxChangedBytes: 60 * MiB,
  maxBinaryBytes: 10 * MiB,
  maxChangedBinaryBytes: 60 * MiB,
  maxChangedBinaryFiles: 120,
  maxSnapshotBytes: 12 * MiB,
  maxSnapshotFiles: 100,
  maxTrackedBytes: 181 * MiB,
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
