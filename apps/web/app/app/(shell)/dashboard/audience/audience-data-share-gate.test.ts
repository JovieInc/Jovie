import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withDbSessionTx } from '@/lib/auth/session';
import { type DbSessionTx, getAudienceServerData } from './audience-data';

// The cache returns a stale payload that still carries contact details, as it
// would after a person revoked their share inside the 5-minute window.
const STALE = vi.hoisted(() => ({
  mode: 'members',
  rows: [
    {
      id: 'm1',
      email: 'revoked@example.com',
      phone: '+15550100001',
      emailVisibleToArtist: true,
    },
  ],
  view: 'all',
}));

vi.mock('next/cache', () => ({
  unstable_cache: () => async () => STALE,
}));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: vi.fn() }));
vi.mock('@/lib/db', () => ({
  doesColumnExist: vi.fn().mockResolvedValue(true),
}));

describe('audience share gate runs outside the cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redacts cached rows when the share has since been revoked', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      // No active share rows for this profile any more.
      where: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(withDbSessionTx).mockImplementation(operation =>
      operation(chain as unknown as DbSessionTx, 'app-user-1')
    );

    const result = await getAudienceServerData({
      userId: 'app-user-1',
      selectedProfileId: 'profile-1',
      searchParams: {},
    });

    expect(result.rows[0]).toMatchObject({
      email: null,
      phone: null,
      emailVisibleToArtist: false,
    });
  });
});
