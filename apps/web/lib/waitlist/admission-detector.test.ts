import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileWaitlistAdmission } from './admission-detector';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mocks.select }) }),
    insert: () => ({
      values: (values: unknown) => {
        mocks.values(values);
        return { onConflictDoNothing: () => ({ returning: mocks.returning }) };
      },
    }),
  },
}));

describe('waitlist admission repair', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deduplicates normalized emails and preserves approvals without inventing intake data', async () => {
    mocks.select
      .mockResolvedValueOnce([
        { email: ' Artist@Example.test ', userStatus: 'waitlist_pending' },
        { email: 'artist@example.test', userStatus: 'waitlist_approved' },
        { email: 'ARTIST@example.test', userStatus: 'waitlist_pending' },
        { email: 'pending@example.test', userStatus: 'waitlist_pending' },
      ])
      .mockResolvedValueOnce([{ count: 0 }]);
    mocks.returning.mockResolvedValue([{ id: 'approved' }, { id: 'pending' }]);
    const now = new Date('2026-10-22T00:00:00Z');
    expect(await reconcileWaitlistAdmission(now)).toEqual({
      healedMissingEntries: 2,
      stalePending: 0,
    });
    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        email: 'artist@example.test',
        status: 'approved',
        approvedAt: now,
        waitlistedAt: null,
      }),
      expect.objectContaining({
        email: 'pending@example.test',
        status: 'waitlisted',
        waitlistedAt: now,
      }),
    ]);
    const [entries] = mocks.values.mock.calls[0] as [Record<string, unknown>[]];
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('fullName');
      expect(entry).not.toHaveProperty('primarySocialUrl');
    }
  });

  it('reports actual inserted rows when another writer wins a race', async () => {
    mocks.select
      .mockResolvedValueOnce([
        { email: 'pending@example.test', userStatus: 'waitlist_pending' },
      ])
      .mockResolvedValueOnce([{ count: 0 }]);
    mocks.returning.mockResolvedValue([]);
    expect((await reconcileWaitlistAdmission()).healedMissingEntries).toBe(0);
  });

  it('does not claim a successful repair if the write fails', async () => {
    mocks.select.mockResolvedValueOnce([
      { email: 'pending@example.test', userStatus: 'waitlist_pending' },
    ]);
    mocks.returning.mockRejectedValue(new Error('write failed'));
    await expect(reconcileWaitlistAdmission()).rejects.toThrow('write failed');
  });
});
