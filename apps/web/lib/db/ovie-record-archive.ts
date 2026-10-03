import 'server-only';

import { and, sql as drizzleSql, gt, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';

type ArchiveRecord = { key: string; value: unknown };

function jsonValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Record value must be JSON');
  return serialized;
}

/** Atomically replace the hot document and preserve immutable archive rows. */
export async function compareAndSetOperatingRecords(
  key: string,
  expectedValue: unknown,
  nextValue: unknown,
  records: ArchiveRecord[]
): Promise<boolean> {
  const keys = new Set(records.map(record => record.key));
  if (
    records.length > 250 ||
    keys.size !== records.length ||
    keys.has(key) ||
    keys.has('')
  ) {
    throw new Error(
      'Archive batch requires at most 250 distinct non-root keys'
    );
  }
  const serializedRecords = JSON.stringify(
    records.map(record => ({
      key: record.key,
      value: JSON.parse(jsonValue(record.value)) as unknown,
    }))
  );
  // The archive INSERT depends on the successful root CAS. A conflicting value
  // deliberately violates value's NOT NULL constraint, rolling back this entire
  // statement. Equal conflicts do not update the row or its original timestamp.
  const result = await db.execute<{ key: string }>(drizzleSql`
    WITH changed AS (
      UPDATE ${ovieOperatingKv}
      SET value = ${jsonValue(nextValue)}::jsonb, updated_at = now()
      WHERE key = ${key} AND value = ${jsonValue(expectedValue)}::jsonb
      RETURNING key
    ), archived AS (
      INSERT INTO ${ovieOperatingKv} (key, value)
      SELECT incoming.key, incoming.value
      FROM jsonb_to_recordset(${serializedRecords}::jsonb)
        AS incoming(key text, value jsonb)
      CROSS JOIN changed
      ORDER BY incoming.key COLLATE "C"
      ON CONFLICT (key) DO UPDATE
        SET value = NULL
        WHERE ${ovieOperatingKv}.value IS DISTINCT FROM excluded.value
      RETURNING key
    )
    SELECT changed.key FROM changed
      CROSS JOIN (SELECT count(*) FROM archived) AS archive_count
  `);
  // Neon returns a result object; the disposable Postgres canary returns rows.
  const rows: { key: string }[] = Array.isArray(result) ? result : result.rows;
  return rows.length === 1;
}

function prefixUpperBound(prefix: string): string {
  if (!prefix || prefix.includes('\0') || /[\uD800-\uDFFF]/u.test(prefix)) {
    throw new Error('Archive prefix must be nonempty valid text');
  }
  const characters = Array.from(prefix);
  while (characters.length) {
    const last = characters.pop();
    const codePoint = last?.codePointAt(0);
    if (codePoint !== undefined && codePoint < 0x10ffff) {
      const next = codePoint === 0xd7ff ? 0xe000 : codePoint + 1;
      return characters.join('') + String.fromCodePoint(next);
    }
  }
  throw new Error('Archive prefix must have a finite upper bound');
}

/** Stable, bounded pagination that cannot read outside the requested prefix. */
export async function listOperatingRecords(
  prefix: string,
  after: string | undefined,
  limit: number
): Promise<ArchiveRecord[]> {
  const upperBound = prefixUpperBound(prefix);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 101 ||
    (after !== undefined && !after.startsWith(prefix))
  ) {
    throw new Error('Invalid archive page boundary or limit');
  }
  const orderedKey = drizzleSql`${ovieOperatingKv.key} COLLATE "C"`;
  return db
    .select({ key: ovieOperatingKv.key, value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(
      and(
        gte(orderedKey, prefix),
        lt(orderedKey, upperBound),
        after === undefined ? undefined : gt(orderedKey, after)
      )
    )
    .orderBy(orderedKey)
    .limit(limit);
}
