import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { CHARTMETRIC_SCHEMA_SNAPSHOT } from './chartmetric-endpoints';
import type { CatalogEntry, ParityRow } from './types';

/** Audited discovery contracts; not a claim that the inventory is complete. */
export const PARITY_TARGET_VERSION = '2026-10-15.3';
export const PARITY_TARGET_ROW_COUNT = 245;
export const PARITY_TARGET_SHA256 =
  '9f76c63b79f88d02dabcf94b19c4c9adf049006a18e48ce629934a9d00487c03';

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
      row.docUrl === entry.docUrl &&
      isDeepStrictEqual(row.contract, entry.contract)
    );
  });
}
