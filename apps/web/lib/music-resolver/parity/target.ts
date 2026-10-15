import { createHash } from 'node:crypto';
import { CHARTMETRIC_SCHEMA_SNAPSHOT } from './chartmetric-endpoints';
import type { CatalogEntry, ParityRow } from './types';

/** A freeze of the existing catalog, not a claim that its inventory is complete. */
export const PARITY_TARGET_VERSION = '2026-10-15.1';
export const PARITY_TARGET_ROW_COUNT = 245;
export const PARITY_TARGET_SHA256 =
  '58b9a37f2de7ac1d49caeb64b4907769f7d562c1a2f51433714f430d58cc4271';

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function catalogHash(entries: readonly CatalogEntry[]): string {
  const sorted = [...entries].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  return sha256(
    JSON.stringify({ chartmetric: CHARTMETRIC_SCHEMA_SNAPSHOT, rows: sorted })
  );
}

export function matchesTarget(
  rows: readonly ParityRow[],
  target: readonly CatalogEntry[]
): boolean {
  if (catalogHash(target) !== PARITY_TARGET_SHA256) return false;
  if (rows.length !== target.length) return false;
  const byId = new Map(rows.map(row => [row.id, row]));
  return target.every(entry => {
    const row = byId.get(entry.id);
    return (
      row?.vendor === entry.vendor &&
      row.capability === entry.capability &&
      row.docUrl === entry.docUrl
    );
  });
}
