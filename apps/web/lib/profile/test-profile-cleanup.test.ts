import { describe, expect, it, vi } from 'vitest';
import {
  runTestProfileCleanup,
  type TestProfileCleanupDb,
} from './test-profile-cleanup';

function fakeDb(rows: Record<string, unknown>[]) {
  const execute = vi.fn(async (query: unknown) => {
    const text = JSON.stringify(query);
    if (text.includes('UPDATE creator_profiles')) {
      const ids = rows.filter(r => r.__kept).map(r => ({ id: r.id }));
      return { rows: ids };
    }
    return { rows };
  });
  const db: TestProfileCleanupDb = {
    atomic: fn => fn({ execute: execute as never }),
  };
  return { db, execute };
}

const row = (id: string, handle: string, email: string) => ({
  id,
  handle,
  email,
  is_public: true,
  pool_bound: id === 'a',
});

describe('runTestProfileCleanup', () => {
  it('dry run reports counts and writes nothing', async () => {
    const { db, execute } = fakeDb([
      row('a', 'tabc', 'gp-1+clerk_test@test.jovie.com'),
      row('b', 'authqaprod', 'x+clerk_test@jov.ie'),
      row('c', 'realone', 'real@gmail.com'),
    ]);
    const report = await runTestProfileCleanup(db, { apply: false });
    expect(report).toMatchObject({
      mode: 'dry-run',
      candidates: 3,
      matched: 1,
      stillPublic: 1,
      poolBound: 1,
      skippedProtected: 1,
      skippedNotTest: 1,
      unpublished: 0,
    });
    expect(report.sample[0]?.email).toBe('***+clerk_test@test.jovie.com');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('apply updates only verified test rows', async () => {
    const rows = [
      { ...row('a', 'tabc', 'gp-1+clerk_test@test.jovie.com'), __kept: true },
      row('c', 'realone', 'real@gmail.com'),
    ];
    const { db, execute } = fakeDb(rows);
    const report = await runTestProfileCleanup(db, { apply: true });
    expect(report).toMatchObject({ matched: 1, unpublished: 1, unbound: 1 });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
