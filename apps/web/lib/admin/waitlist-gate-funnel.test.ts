import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWaitlistGateFunnel } from './waitlist-gate-funnel';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  doesTableExist: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  doesTableExist: mocks.doesTableExist,
}));
vi.mock('@/lib/admin/organic-waitlist', () => ({
  organicWaitlistEntrySql: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.doesTableExist.mockResolvedValue(true);
});

describe('waitlist role measurement', () => {
  it('includes general and specialist submissions in the existing role census', async () => {
    const roleQuery = {
      from: () => ({
        where: () => ({
          groupBy: () =>
            Promise.resolve([
              { role: 'individual', count: 2 },
              { role: 'team', count: '3' },
              { role: 'organization', count: 4 },
              { role: 'artist', count: 5 },
              { role: 'other', count: 1 },
            ]),
        }),
      }),
    };
    const funnelQuery = {
      from: () => ({
        where: () => Promise.resolve([{ sent: 1, p50Hours: null }]),
      }),
    };
    mocks.select
      .mockReturnValueOnce(roleQuery)
      .mockReturnValueOnce(funnelQuery);

    const result = await getWaitlistGateFunnel();

    expect(result.byRole).toEqual(
      expect.arrayContaining([
        { role: 'individual', count: 2 },
        { role: 'team', count: 3 },
        { role: 'organization', count: 4 },
        { role: 'artist', count: 5 },
      ])
    );
    expect(result.byRole.filter(row => row.role === 'other')).toHaveLength(1);
    expect(result.invite.sent).toBe(1);
    expect(result.p50HoursSentToGoldenPath).toBeNull();
  });

  it('keeps an empty count for every supported context before the table exists', async () => {
    mocks.doesTableExist.mockResolvedValue(false);

    const result = await getWaitlistGateFunnel();

    expect(result.byRole).toEqual(
      expect.arrayContaining([
        { role: 'individual', count: 0 },
        { role: 'team', count: 0 },
        { role: 'organization', count: 0 },
        { role: 'artist', count: 0 },
      ])
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
