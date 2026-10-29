import inventory from '../../../../scripts/copy-inventory/inventory.gen.json';

/** One visible copy line, as produced by `scripts/copy-inventory/extract.mjs`. */
export interface CopyRow {
  readonly id: string;
  readonly route: string;
  readonly section: string;
  readonly role: string;
  readonly text: string;
  readonly source: string;
  readonly alsoOn?: readonly string[];
}

export const COPY_ROWS: readonly CopyRow[] = inventory.rows as CopyRow[];

const BY_ID = new Map(COPY_ROWS.map(row => [row.id, row]));

export function getCopyRow(id: string): CopyRow | undefined {
  return BY_ID.get(id);
}

/** Routes in inventory order (traffic order), each with its line count. */
export function listCopyRoutes(): readonly { route: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of COPY_ROWS) {
    counts.set(row.route, (counts.get(row.route) ?? 0) + 1);
  }
  return [...counts].map(([route, count]) => ({ route, count }));
}
