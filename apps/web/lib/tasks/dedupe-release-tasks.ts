/**
 * Dedupe release-plan tasks that represent the same work item.
 *
 * Double-instantiation of the default template (or catalog) for the same
 * release produces pairs like "Enter metadata" as J-2 and J-22. Identity is
 * `releaseId + catalogSlug` when present, else `releaseId + normalized title`.
 * Standalone (non-release) tasks are never collapsed.
 */

export interface DedupeTaskLike {
  readonly id: string;
  readonly taskNumber: number;
  readonly releaseId: string | null;
  readonly title: string;
  readonly metadata?: Record<string, unknown> | null;
}

function readCatalogSlug(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const value = metadata?.catalogSlug;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getReleaseTaskWorkKey(task: DedupeTaskLike): string {
  if (!task.releaseId) {
    return `id:${task.id}`;
  }

  const slug = readCatalogSlug(task.metadata ?? null);
  const identity = slug ?? task.title.trim().toLowerCase();
  return `release:${task.releaseId}:${identity}`;
}

/**
 * Keep one row per release work identity. Prefer the lowest task number
 * (earliest instantiation) when duplicates exist. Preserves relative order
 * of the winning rows as they first appeared in the input.
 */
export function dedupeReleaseTasks<T extends DedupeTaskLike>(
  tasks: readonly T[]
): T[] {
  if (tasks.length <= 1) return [...tasks];

  const bestByKey = new Map<string, T>();
  for (const task of tasks) {
    const key = getReleaseTaskWorkKey(task);
    const existing = bestByKey.get(key);
    if (!existing || task.taskNumber < existing.taskNumber) {
      bestByKey.set(key, task);
    }
  }

  const winnerIds = new Set([...bestByKey.values()].map(task => task.id));
  return tasks.filter(task => winnerIds.has(task.id));
}
