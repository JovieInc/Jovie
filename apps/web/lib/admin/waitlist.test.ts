import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWaitlistIntegritySummary } from './waitlist';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), doesTableExist: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { execute: mocks.execute },
  doesTableExist: mocks.doesTableExist,
}));

describe('waitlist integrity summary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.doesTableExist.mockResolvedValue(true);
  });

  it('counts each direction once, with signed-up entries as a subset', async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          users_missing_waitlist_entry: '49',
          entries_missing_user: '2',
          signed_up_entries_missing_user: '1',
        },
      ],
    });
    expect(await getWaitlistIntegritySummary()).toEqual({
      usersMissingWaitlistEntry: 49,
      entriesMissingUser: 2,
      signedUpEntriesMissingUser: 1,
      totalIssues: 51,
    });
  });

  it('reports zero when the waitlist table has not been provisioned', async () => {
    mocks.doesTableExist.mockResolvedValue(false);
    expect((await getWaitlistIntegritySummary()).totalIssues).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('propagates an audit failure instead of presenting a clean report', async () => {
    mocks.execute.mockRejectedValue(new Error('database unavailable'));
    await expect(getWaitlistIntegritySummary()).rejects.toThrow(
      'database unavailable'
    );
  });
});
