import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: mocks }));

import {
  compareAndSetOperatingRecords,
  listOperatingRecords,
} from './ovie-record-archive';

describe('atomic operating record archive validation', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(
    [
      [{ key: 'root', value: 1 }],
      [
        { key: 'archive:one', value: 1 },
        { key: 'archive:one', value: 1 },
      ],
      [{ key: '', value: 1 }],
      Array.from({ length: 251 }, (_, index) => ({
        key: `archive:${index}`,
        value: index,
      })),
    ].map(records => [records])
  )('rejects unsafe archive key sets before writing', async records => {
    await expect(
      compareAndSetOperatingRecords('root', 1, 2, records)
    ).rejects.toThrow('250 distinct non-root keys');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects non-JSON values before writing', async () => {
    await expect(
      compareAndSetOperatingRecords('root', 1, 2, [
        { key: 'archive:one', value: undefined },
      ])
    ).rejects.toThrow('Record value must be JSON');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('reports database CAS misses and propagates persistence failures', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await expect(compareAndSetOperatingRecords('root', 1, 2, [])).resolves.toBe(
      false
    );
    mocks.execute.mockRejectedValueOnce(new Error('Persistence failed'));
    await expect(
      compareAndSetOperatingRecords('root', 1, 2, [])
    ).rejects.toThrow('Persistence failed');
  });

  it.each([
    { result: { rows: [{ key: 'root' }] } },
    { result: [{ key: 'root' }] },
  ])(
    'accepts successful Neon and disposable Postgres results',
    async ({ result }) => {
      mocks.execute.mockResolvedValueOnce(result);
      await expect(
        compareAndSetOperatingRecords('root', 1, 2, [])
      ).resolves.toBe(true);
    }
  );

  it.each([0, 102, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an unbounded or invalid page size %s',
    async limit => {
      await expect(
        listOperatingRecords('archive:worker:', undefined, limit)
      ).rejects.toThrow('Invalid archive page boundary or limit');
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each(['other:worker:item', 'archive:other:item', ''])(
    'rejects a cursor outside the archive prefix',
    async after => {
      await expect(
        listOperatingRecords('archive:worker:', after, 10)
      ).rejects.toThrow('Invalid archive page boundary or limit');
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each(['', '\0', '\ud800', '\u{10ffff}'])(
    'rejects prefixes without a valid bounded text range',
    async prefix => {
      await expect(listOperatingRecords(prefix, undefined, 10)).rejects.toThrow(
        'Archive prefix'
      );
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );
});
