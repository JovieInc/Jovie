import { describe, expect, it, vi } from 'vitest';

const chain = vi.hoisted(() => {
  const c = {
    rows: [] as Array<{ total: number }>,
    where: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
  };
  c.select.mockImplementation(() => c);
  c.from.mockImplementation(() => c);
  c.innerJoin.mockImplementation(() => c);
  c.where.mockImplementation(async () => c.rows);
  return c;
});
const predicate = vi.hoisted(() => ({ marker: 'public-release-eligibility' }));

vi.mock('@/lib/db', () => ({ db: { select: chain.select } }));
vi.mock('@/lib/profile/public-release-eligibility', () => ({
  publicReleaseEligibilitySqlPredicate: () => predicate,
}));

import { countVisibleReleaseListenLinks } from './release-listen-links';

describe('countVisibleReleaseListenLinks', () => {
  it('counts through the canonical public-release predicate', async () => {
    chain.rows = [{ total: 3 }];
    expect(await countVisibleReleaseListenLinks('profile-1')).toBe(3);
    expect(JSON.stringify(chain.where.mock.calls[0]?.[0])).toContain(
      'public-release-eligibility'
    );
  });

  it('returns 0 when the query returns no row', async () => {
    chain.rows = [];
    expect(await countVisibleReleaseListenLinks('profile-1')).toBe(0);
  });
});
