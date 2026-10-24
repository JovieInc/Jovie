import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreator } from '@/hooks/useCreator';
import { CreatorProfile } from './CreatorProfile';

vi.mock('@/hooks/useCreator', () => ({ useCreator: vi.fn() }));
const creator = {
  id: 'creator-1',
  username: 'artist',
  usernameNormalized: 'artist',
  displayName: 'Sample Artist',
  bio: null,
  avatarUrl: null,
  creatorType: 'artist',
  spotifyUrl: 'https://open.spotify.com/artist/artist',
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: 'artist',
  isPublic: true,
  isVerified: false,
  isClaimed: true,
  isFeatured: false,
  marketingOptOut: false,
  settings: null,
  theme: null,
  socialLinks: [],
} satisfies NonNullable<ReturnType<typeof useCreator>['creator']>;

beforeEach(() => {
  vi.mocked(useCreator).mockReturnValue({
    creator,
    loading: false,
    error: null,
  });
});

describe('CreatorProfile', () => {
  it('shows truthful audio fallback for a linked release without a player', () => {
    render(<CreatorProfile username='artist' />);
    expect(
      screen.getByRole('heading', { name: 'Sample Artist' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Latest Release' })
    ).toBeVisible();
    expect(screen.getByText('Audio unavailable')).toBeVisible();
    expect(screen.queryByText(/music player placeholder/i)).toBeNull();
  });

  it('omits the release fallback when no Spotify release is linked', () => {
    vi.mocked(useCreator).mockReturnValue({
      creator: { ...creator, spotifyUrl: null },
      loading: false,
      error: null,
    });
    render(<CreatorProfile username='artist' />);
    expect(
      screen.getByRole('heading', { name: 'Sample Artist' })
    ).toBeVisible();
    expect(screen.queryByText('Latest Release')).toBeNull();
    expect(screen.queryByText('Audio unavailable')).toBeNull();
  });

  it('shows the profile error instead of missing-media copy after a load failure', () => {
    vi.mocked(useCreator).mockReturnValue({
      creator: null,
      loading: false,
      error: new Error('Unavailable'),
    });
    render(<CreatorProfile username='artist' />);
    expect(
      screen.getByText(
        'Failed to load creator profile. Please try again later.'
      )
    ).toBeVisible();
    expect(screen.queryByText('Audio unavailable')).toBeNull();
  });
});
