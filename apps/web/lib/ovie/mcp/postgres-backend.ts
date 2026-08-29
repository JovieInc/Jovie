import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { OVIE_MCP_INDEX_CAP, type RecordBackend } from './store';

export function postgresRecordBackend(): RecordBackend {
  const backend: RecordBackend = {
    async get(key) {
      const rows = await db
        .select({ value: ovieOperatingKv.value })
        .from(ovieOperatingKv)
        .where(eq(ovieOperatingKv.key, key))
        .limit(1);
      return rows[0]?.value ?? null;
    },
    async set(key, value) {
      const now = new Date();
      await db
        .insert(ovieOperatingKv)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: ovieOperatingKv.key,
          set: { value, updatedAt: now },
        });
    },
    async setIfAbsent(key, value) {
      const now = new Date();
      const rows = await db
        .insert(ovieOperatingKv)
        .values({ key, value, updatedAt: now })
        .onConflictDoNothing({ target: ovieOperatingKv.key })
        .returning({ key: ovieOperatingKv.key });
      return rows.length === 1;
    },
    async compareAndSet(key, expectedValue, nextValue) {
      const rows = await db
        .update(ovieOperatingKv)
        .set({ value: nextValue, updatedAt: new Date() })
        .where(
          and(
            eq(ovieOperatingKv.key, key),
            eq(ovieOperatingKv.value, expectedValue)
          )
        )
        .returning({ key: ovieOperatingKv.key });
      return rows.length === 1;
    },
    async lpush(key, value) {
      const current = await backend.get(key);
      const list = Array.isArray(current) ? current.map(String) : [];
      await backend.set(key, [value, ...list].slice(0, OVIE_MCP_INDEX_CAP));
    },
    async lrange(key, start, stop) {
      const current = await backend.get(key);
      const all = Array.isArray(current) ? current.map(String) : [];
      const end = stop < 0 ? all.length : stop + 1;
      return all.slice(start, end);
    },
  };
  return backend;
}
