const MiB = 1024 * 1024;

export const HYGIENE_LIMITS = Object.freeze({
  maxFileBytes: 10 * MiB,
  maxChangedBytes: 60 * MiB,
  maxBinaryBytes: 10 * MiB,
  maxChangedBinaryBytes: 60 * MiB,
  maxChangedBinaryFiles: 120,
  maxSnapshotBytes: 12 * MiB,
  // Raised 121 -> 133 (+10%, the documented per-raise cap) on 2026-11-15.
  // origin/main sat at 119/121. The chat-history switcher refresh adds 14
  // live toHaveScreenshot baselines, and five admin pngs no longer have a
  // manifest consumer (pruned in the same change). Resulting tree: 128 files
  // (~8.4 MiB of the unchanged 12 MiB byte budget). The prior raises are
  // recorded in docs/ci/repository-health.md.
  maxSnapshotFiles: 133,
  // Raised 180 -> 198 MiB (+10%, the documented per-raise cap) under JOV-6635:
  // origin/main measured 178.14 MiB (99.0% of budget), blocking every PR that
  // adds tracked bytes. Measurements in docs/ci/repository-health.md.
  // ratchet: do not raise this again. 2026-10-29 pruned drizzle snapshots to
  // the newest one (-10.29 MiB, 197.49 -> 187.20 MiB, ~10.8 MiB headroom)
  // instead of raising the budget. Free headroom by deleting regenerable or
  // dead bytes; the clean line of repo-hygiene-guard reports remaining headroom.
  maxTrackedBytes: 198 * MiB,
  maxTrackedBinaryBytes: 96 * MiB,
});

// Generated `*.gen.json` files over this size fail the hygiene guard unless
// the path is listed in GEN_JSON_SIZE_ALLOWLIST (reviewed edit, with reason).
export const MAX_GEN_JSON_BYTES = 1 * MiB;
export const GEN_JSON_SIZE_ALLOWLIST = Object.freeze([]);

// Drizzle keeps ~1.2 MiB full-schema snapshots; only the newest is read.
export const MAX_RETAINED_DRIZZLE_SNAPSHOTS = 3;

// Early-warning threshold for the combined-tree tracked-bytes budget. The
// merge_group check ejects every queued PR once main + member crosses the
// budget, so surface shrinking headroom before it becomes a queue outage.
export const TRACKED_BYTES_WARNING_RATIO = 0.95;

// Planning-level threshold: fires once free space drops under 20% of the
// budget, while there is still time to schedule the next prune of dead or
// regenerable bytes before the 95% shrink-now line turns the signal urgent.
// Lowered 0.9 -> 0.8 on 2026-11-21 (founder ask: 20% headroom is the alert
// line). The lanes doctor raises the matching repo-headroom-low alert on
// origin/main (scripts/lanes/repo_headroom.py) so Summer routes the prune.
export const TRACKED_BYTES_PLAN_RATIO = 0.8;

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

// Non-failing plan warning for the 80%-to-95% band. Above 95% the shrink-now
// warning owns the signal; below 80% there is nothing to plan yet.
export function trackedBytesBudgetPlanWarning(
  bytes,
  maxTrackedBytes = HYGIENE_LIMITS.maxTrackedBytes
) {
  if (bytes <= maxTrackedBytes * TRACKED_BYTES_PLAN_RATIO) return null;
  if (bytes > maxTrackedBytes * TRACKED_BYTES_WARNING_RATIO) return null;
  const headroom = maxTrackedBytes - bytes;
  const percent = ((bytes / maxTrackedBytes) * 100).toFixed(2);
  return `tracked regular files total ${bytes} bytes (${percent}% of the ${maxTrackedBytes}-byte combined-tree budget; ${(headroom / 1_000_000).toFixed(2)} MB headroom); past the 80% plan line (under 20% headroom) — schedule the next prune of dead or regenerable bytes before queued PRs start ejecting`;
}

// Every warning level for `bytes`, shrink-now first, so an emitter that logs
// the entries in order keeps the most urgent annotation first.
export function trackedBytesBudgetWarnings(
  bytes,
  maxTrackedBytes = HYGIENE_LIMITS.maxTrackedBytes
) {
  return [
    trackedBytesBudgetWarning(bytes, maxTrackedBytes),
    trackedBytesBudgetPlanWarning(bytes, maxTrackedBytes),
  ].filter(Boolean);
}

// Emits each warning level as its own non-failing ::warning annotation under
// `prefix` (e.g. 'Combined tree: ').
export function logTrackedBytesBudgetWarnings(bytes, log, prefix) {
  for (const warning of trackedBytesBudgetWarnings(bytes)) {
    log(`::warning::${prefix}${warning}`);
  }
}
