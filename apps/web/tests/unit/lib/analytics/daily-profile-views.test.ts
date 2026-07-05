import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  incrementDailyProfileViews,
  isMissingDailyProfileViewsTableError,
} from '@/lib/analytics/daily-profile-views';

vi.mock('@/lib/db/schema/analytics', () => ({
  dailyProfileViews: {
    creatorProfileId: 'creator_profile_id',
    viewDate: 'view_date',
    viewCount: 'view_count',
    id: 'id',
  },
}));

describe('daily-profile-views analytics helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects missing daily_profile_views table errors', () => {
    expect(
      isMissingDailyProfileViewsTableError({
        code: '42P01',
        message: 'missing',
      })
    ).toBe(true);
    expect(
      isMissingDailyProfileViewsTableError({ cause: { code: '42P01' } })
    ).toBe(true);
    expect(
      isMissingDailyProfileViewsTableError(new Error('other failure'))
    ).toBe(false);
  });

  it('upserts daily_profile_views with onConflictDoUpdate', async () => {
    const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn().mockReturnValue({
      onConflictDoUpdate: onConflictDoUpdateMock,
    });
    const insertMock = vi.fn().mockReturnValue({
      values: valuesMock,
    });

    await incrementDailyProfileViews(
      { insert: insertMock } as never,
      'profile_123',
      '2026-06-26',
      new Date('2026-06-26T12:00:00.000Z')
    );

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'profile_123',
        viewDate: '2026-06-26',
        viewCount: 1,
      })
    );
    expect(onConflictDoUpdateMock).toHaveBeenCalled();
  });
});
