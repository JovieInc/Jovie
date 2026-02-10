import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMusicLinksForm } from '@/components/dashboard/organisms/listen-now-form/useMusicLinksForm';
import type { DashboardSocialLink } from '@/lib/queries/useDashboardSocialLinksQuery';
import type { Artist } from '@/types/db';

const mockUseDashboardSocialLinksQuery = vi.fn();
const mockUseSaveSocialLinksMutation = vi.fn();
const mockUseProfileMutation = vi.fn();

vi.mock('@/lib/queries/useDashboardSocialLinksQuery', () => ({
  useDashboardSocialLinksQuery: (profileId: string) =>
    mockUseDashboardSocialLinksQuery(profileId),
  useSaveSocialLinksMutation: (profileId: string) =>
    mockUseSaveSocialLinksMutation(profileId),
}));

vi.mock('@/lib/queries', () => ({
  useProfileMutation: (...args: unknown[]) => mockUseProfileMutation(...args),
}));

vi.mock('@/lib/queries/useDspMatchesQuery', () => ({
  useDspMatchesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  normalizeUrl: (url: string) => url,
}));

const baseArtist: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'test-artist',
  spotify_id: '',
  name: 'Test Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
  spotify_url: '',
  apple_music_url: '',
  youtube_url: '',
};

describe('useMusicLinksForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseDashboardSocialLinksQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });

    mockUseSaveSocialLinksMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    });

    mockUseProfileMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('filters additional links to non-primary music platforms', async () => {
    const links: DashboardSocialLink[] = [
      { id: '1', platform: 'spotify', url: 'https://spotify.com/artist' },
      { id: '2', platform: 'soundcloud', url: 'https://soundcloud.com/artist' },
      { id: '3', platform: 'instagram', url: 'https://instagram.com/artist' },
    ];

    mockUseDashboardSocialLinksQuery.mockReturnValue({
      data: links,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useMusicLinksForm({ artist: baseArtist })
    );

    await waitFor(() => {
      expect(result.current.additionalLinks).toHaveLength(1);
    });

    expect(result.current.additionalLinks[0]?.platform).toBe('soundcloud');
  });

  it('saves primary fields and preserves non-music links ordering', async () => {
    const links: DashboardSocialLink[] = [
      { id: '1', platform: 'spotify', url: 'https://spotify.com/artist' },
      { id: '2', platform: 'soundcloud', url: 'https://soundcloud.com/artist' },
      { id: '3', platform: 'instagram', url: 'https://instagram.com/artist' },
    ];

    const saveSocialMutation = vi.fn().mockResolvedValue({ success: true });
    const updateProfile = vi.fn();

    mockUseDashboardSocialLinksQuery.mockReturnValue({
      data: links,
      isLoading: false,
    });

    mockUseSaveSocialLinksMutation.mockReturnValue({
      mutateAsync: saveSocialMutation,
      isPending: false,
    });

    mockUseProfileMutation.mockReturnValue({
      mutate: updateProfile,
      isPending: false,
    });

    const { result } = renderHook(() =>
      useMusicLinksForm({ artist: baseArtist })
    );

    await waitFor(() => {
      expect(result.current.additionalLinks).toHaveLength(1);
    });

    act(() => {
      result.current.updatePrimaryField(
        'spotifyUrl',
        'https://open.spotify.com/artist'
      );
      result.current.updateAdditionalLink(
        0,
        'url',
        ' https://soundcloud.com/updated '
      );
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as FormEvent);
    });

    expect(updateProfile).toHaveBeenCalledWith({
      profileId: 'artist-1',
      updates: {
        spotifyUrl: 'https://open.spotify.com/artist',
        appleMusicUrl: null,
        youtubeUrl: null,
      },
    });

    expect(saveSocialMutation).toHaveBeenCalledWith({
      profileId: 'artist-1',
      links: [
        {
          platform: 'spotify',
          platformType: 'spotify',
          url: 'https://spotify.com/artist',
          sortOrder: 0,
          isActive: true,
        },
        {
          platform: 'instagram',
          platformType: 'instagram',
          url: 'https://instagram.com/artist',
          sortOrder: 1,
          isActive: true,
        },
        {
          platform: 'soundcloud',
          platformType: 'soundcloud',
          url: 'https://soundcloud.com/updated',
          sortOrder: 2,
          isActive: true,
        },
      ],
    });
  });
});
