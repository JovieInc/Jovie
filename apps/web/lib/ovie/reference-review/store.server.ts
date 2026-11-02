import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { ReferenceRepository } from '@/lib/agent-os/design-reference-corpus/adaptive/repository';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import type {
  PrivateReferencePreview,
  ReferencePreviewRepository,
} from './intake';

/** Existing Ovie KV. Scope is encoded in the key and verified in the value. */
export const referenceRepository: ReferenceRepository &
  ReferencePreviewRepository = {
  async readPreview(key) {
    const [row] = await db
      .select({ value: ovieOperatingKv.value })
      .from(ovieOperatingKv)
      .where(eq(ovieOperatingKv.key, key))
      .limit(1);
    if (!row) return null;
    const value = row.value as PrivateReferencePreview;
    if (
      value.schema !== 'jovie.reference-preview/v1' ||
      typeof value.base64 !== 'string' ||
      value.base64.length > 2_800_000
    )
      throw new Error('Invalid private reference preview.');
    return value;
  },
  async insertPreview(key, value) {
    const rows = await db
      .insert(ovieOperatingKv)
      .values({ key, value })
      .onConflictDoNothing()
      .returning({ key: ovieOperatingKv.key });
    return rows.length === 1;
  },
  async read(key) {
    const [row] = await db
      .select({ value: ovieOperatingKv.value })
      .from(ovieOperatingKv)
      .where(eq(ovieOperatingKv.key, key))
      .limit(1);
    return row?.value ?? null;
  },
  async compareAndSet(key, expectedRevision, value) {
    if (expectedRevision === null) {
      const rows = await db
        .insert(ovieOperatingKv)
        .values({ key, value })
        .onConflictDoNothing()
        .returning({ key: ovieOperatingKv.key });
      return rows.length === 1;
    }
    const rows = await db
      .update(ovieOperatingKv)
      .set({ value, updatedAt: new Date() })
      .where(
        and(
          eq(ovieOperatingKv.key, key),
          drizzleSql`${ovieOperatingKv.value}->>'revision' = ${String(expectedRevision)}`
        )
      )
      .returning({ key: ovieOperatingKv.key });
    return rows.length === 1;
  },
};
