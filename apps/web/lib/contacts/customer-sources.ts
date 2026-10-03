import { isInternalOrTestAccountEmail } from '@/lib/utils/email';
import type { CanonicalContactSourceRow } from './lifecycle';

function identityKeys(row: CanonicalContactSourceRow): string[] {
  return [
    row.dedupeKey,
    row.userId ? `user:${row.userId}` : null,
    row.creatorProfileId ? `profile:${row.creatorProfileId}` : null,
    row.leadId ? `lead:${row.leadId}` : null,
    row.waitlistEntryId ? `waitlist:${row.waitlistEntryId}` : null,
  ].filter((key): key is string => key !== null);
}

/** Exclude confirmed internal/test identities across every linked source.
 * Raw rows and transition history remain untouched. No names/handles inferred.
 */
export function customerContactSources(
  rows: readonly CanonicalContactSourceRow[],
  excludedUserIds: ReadonlySet<string> = new Set()
): CanonicalContactSourceRow[] {
  const keys = rows.map(identityKeys);
  const neighbors = new Map<string, Set<string>>();
  const excluded = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const rowKeys = keys[index];
    for (const key of rowKeys) {
      const adjacent = neighbors.get(key) ?? new Set<string>();
      for (const other of rowKeys) adjacent.add(other);
      neighbors.set(key, adjacent);
    }
    if (
      isInternalOrTestAccountEmail(row.email) ||
      (row.userId != null && excludedUserIds.has(row.userId))
    ) {
      for (const key of rowKeys) excluded.add(key);
    }
  }
  const queue = [...excluded];
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of neighbors.get(queue[index]) ?? []) {
      if (excluded.has(neighbor)) continue;
      excluded.add(neighbor);
      queue.push(neighbor);
    }
  }
  return rows.filter((_, index) => !keys[index].some(key => excluded.has(key)));
}
