import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

const url = process.env.FLEET_LOCAL_DB_URL;
const clients: { end: () => Promise<void> }[] = [];
vi.mock('@/lib/db', async () => {
  const { setupLocalPostgresCanary } = await import(
    './postgres-canary.test-utils'
  );
  return setupLocalPostgresCanary(url, clients);
});
afterAll(async () => {
  await Promise.all(clients.map(client => client.end()));
});

async function fixture() {
  const { postgresRecordBackend } = await import('./postgres-backend');
  const backend = postgresRecordBackend();
  if (!backend.compareAndSetWithRecords || !backend.listRecords) {
    throw new Error('Archive-capable Postgres backend required');
  }
  const prefix = `archive-canary:${randomUUID()}:`;
  const key = `${prefix}root`;
  await backend.set(key, { version: 1 });
  return {
    backend,
    key,
    prefix,
    archive: backend.compareAndSetWithRecords,
    list: backend.listRecords,
  };
}

describe.skipIf(!url)('actual Postgres atomic operating record archive', () => {
  it('persists a full archive batch and pages it across backend restarts', async () => {
    const { backend, key, prefix, archive, list } = await fixture();
    const records = Array.from({ length: 250 }, (_, index) => ({
      key: `${prefix}history:${String(index).padStart(3, '0')}`,
      value: { result: index },
    }));
    await expect(
      archive(key, { version: 1 }, { version: 2 }, records, 60)
    ).resolves.toBe(true);
    const { postgresRecordBackend } = await import('./postgres-backend');
    const restarted = postgresRecordBackend();
    expect(await restarted.get(key)).toEqual({ version: 2 });
    expect(await restarted.get(records[249].key)).toEqual({ result: 249 });
    const page = await list(`${prefix}history:`, undefined, 101);
    expect(page).toEqual(records.slice(0, 101));
    expect(await list(`${prefix}history:`, page[100].key, 101)).toEqual(
      records.slice(101, 202)
    );
    expect(await backend.get(records[0].key)).toEqual({ result: 0 });
  });

  it('writes no archives for a missed or absent root compare-and-set', async () => {
    const { backend, key, prefix, archive } = await fixture();
    const record = { key: `${prefix}receipt`, value: { evidence: 'original' } };
    for (const target of [key, `${key}:missing`]) {
      expect(
        await archive(target, { version: 0 }, { version: 2 }, [record], 60)
      ).toBe(false);
    }
    expect(await backend.get(key)).toEqual({ version: 1 });
    expect(await backend.get(record.key)).toBeNull();
  });

  it('rolls back the root and all inserts on a conflicting immutable record', async () => {
    const { backend, key, prefix, archive } = await fixture();
    const existingKey = `${prefix}z:existing`;
    const newKey = `${prefix}a:new`;
    await backend.set(existingKey, { evidence: 'original' });
    await expect(
      archive(
        key,
        { version: 1 },
        { version: 2 },
        [
          { key: newKey, value: { evidence: 'new' } },
          { key: existingKey, value: { evidence: 'changed' } },
        ],
        60
      )
    ).rejects.toThrow();
    expect(await backend.get(key)).toEqual({ version: 1 });
    expect(await backend.get(existingKey)).toEqual({ evidence: 'original' });
    expect(await backend.get(newKey)).toBeNull();
  });

  it('accepts equal JSON objects without overwriting the archive timestamp', async () => {
    const { backend, key, prefix, archive } = await fixture();
    const existingKey = `${prefix}existing`;
    await backend.set(existingKey, { one: 1, two: 2 });
    const [{ db }, { ovieOperatingKv }] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/db/schema/ovie'),
    ]);
    const before = await db
      .select()
      .from(ovieOperatingKv)
      .where(eq(ovieOperatingKv.key, existingKey));
    expect(
      await archive(
        key,
        { version: 1 },
        { version: 2 },
        [{ key: existingKey, value: { two: 2, one: 1 } }],
        60
      )
    ).toBe(true);
    const after = await db
      .select()
      .from(ovieOperatingKv)
      .where(eq(ovieOperatingKv.key, existingKey));
    expect(after).toEqual(before);
    expect(await backend.get(key)).toEqual({ version: 2 });
  });

  it('commits only one concurrent root transition and its associated archive', async () => {
    const { backend, key, prefix, archive } = await fixture();
    const results = await Promise.all(
      [2, 3].map(version =>
        archive(
          key,
          { version: 1 },
          { version },
          [{ key: `${prefix}result:${version}`, value: version }],
          60
        )
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? 2 : 3;
    expect(await backend.get(key)).toEqual({ version: winner });
    expect(await backend.get(`${prefix}result:${winner}`)).toBe(winner);
    expect(
      await backend.get(`${prefix}result:${winner === 2 ? 3 : 2}`)
    ).toBeNull();
  });

  it('keeps literal wildcard and Unicode prefixes isolated with ordered cursors', async () => {
    const { backend, prefix, list } = await fixture();
    const scope = `${prefix}worker_%:`;
    const scoped = ['a', 'z', 'é', '𐀀'].map(suffix => ({
      key: `${scope}${suffix}`,
      value: suffix,
    }));
    await Promise.all(
      [
        ...scoped,
        { key: `${prefix}workerXX:secret`, value: 'other worker' },
        { key: `${prefix}worker_&:secret`, value: 'next prefix' },
      ].map(record => backend.set(record.key, record.value))
    );
    expect(await list(scope, undefined, 101)).toEqual(scoped);
    expect(await list(scope, scoped[1].key, 101)).toEqual(scoped.slice(2));
    expect(await list(`${scope}𐀀`, undefined, 1)).toEqual(scoped.slice(3));
    await expect(list(scope, `${prefix}root`, 10)).rejects.toThrow(
      'Invalid archive page boundary or limit'
    );
  });
});
