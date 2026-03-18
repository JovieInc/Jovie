import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock server-only modules before importing the page
vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/utils/date', () => ({
  toISOStringSafe: vi.fn((d: unknown) =>
    d ? new Date(d as string).toISOString() : new Date().toISOString()
  ),
}));

// Mock TwoStepNotificationsCTA to avoid its heavy dependency tree
vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({
    TwoStepNotificationsCTA: ({
      artist,
    }: {
      artist: { handle: string; name: string };
    }) => (
      <div
        data-testid='two-step-cta'
        data-handle={artist.handle}
        data-name={artist.name}
      />
    ),
  })
);

import { getProfileWithLinks } from '@/lib/services/profile';
import NotificationsPage from '../../../../app/[username]/notifications/page';

const baseProfile = {
  id: 'profile-1',
  userId: 'user-1',
  creatorType: 'musician',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Test Artist',
  bio: null,
  avatarUrl: null,
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: null,
  appleMusicId: null,
  youtubeMusicId: null,
  deezerId: null,
  tidalId: null,
  soundcloudId: null,
  isPublic: true,
  isVerified: false,
  isClaimed: false,
  isFeatured: false,
  marketingOptOut: false,
  profileViews: 0,
  settings: null,
  theme: null,
  location: null,
  activeSinceYear: null,
  venmoHandle: null,
  genres: null,
  spotifyPopularity: null,
  claimToken: null,
  socialLinks: [],
  contacts: [],
  latestRelease: null,
  userIsPro: false,
  userClerkId: null,
  userEmail: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('NotificationsPage', () => {
  it('calls notFound when profile is missing', async () => {
    vi.mocked(getProfileWithLinks).mockResolvedValue(null);

    await expect(
      NotificationsPage({ params: Promise.resolve({ username: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound when profile is not public', async () => {
    vi.mocked(getProfileWithLinks).mockResolvedValue({
      ...baseProfile,
      isPublic: false,
    } as never);

    await expect(
      NotificationsPage({ params: Promise.resolve({ username: 'testartist' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders TwoStepNotificationsCTA for a valid public profile', async () => {
    vi.mocked(getProfileWithLinks).mockResolvedValue(baseProfile as never);

    const jsx = await NotificationsPage({
      params: Promise.resolve({ username: 'testartist' }),
    });
    render(jsx as React.ReactElement);

    const cta = screen.getByTestId('two-step-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('data-handle', 'testartist');
    expect(cta).toHaveAttribute('data-name', 'Test Artist');
  });
});
