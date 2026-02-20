import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClaimPage from '../../../../../app/[username]/claim/page';

const {
  mockNoStore,
  mockNotFound,
  mockGetProfileByUsername,
  mockIsClaimTokenValid,
} = vi.hoisted(() => ({
  mockNoStore: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  mockGetProfileByUsername: vi.fn(),
  mockIsClaimTokenValid: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_noStore: mockNoStore,
}));

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: mockGetProfileByUsername,
  isClaimTokenValid: mockIsClaimTokenValid,
}));

describe('ClaimPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls noStore so claim pages always bypass route cache', async () => {
    mockIsClaimTokenValid.mockResolvedValue(true);
    mockGetProfileByUsername.mockResolvedValue({
      username: 'testartist',
      displayName: 'Test Artist',
      avatarUrl: null,
    });

    await ClaimPage({
      params: Promise.resolve({ username: 'testartist' }),
      searchParams: Promise.resolve({ token: 'abc123' }),
    });

    expect(mockNoStore).toHaveBeenCalledTimes(1);
  });
});
