import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClaimPage from '../../../../../app/[username]/claim/page';

const { mockNotFound, mockGetProfileByUsername } = vi.hoisted(() => ({
  mockNotFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  mockGetProfileByUsername: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: mockGetProfileByUsername,
}));

describe('ClaimPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads profile by lowercase username without validating a token', async () => {
    mockGetProfileByUsername.mockResolvedValue({
      id: 'profile_1',
      username: 'testartist',
      displayName: 'Test Artist',
      avatarUrl: null,
    });

    await ClaimPage({
      params: Promise.resolve({ username: 'TestArtist' }),
    });

    expect(mockGetProfileByUsername).toHaveBeenCalledWith('testartist');
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
