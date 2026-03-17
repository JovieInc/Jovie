import { describe, expect, it } from 'vitest';
import {
  buildProfileIdentityFields,
  buildProfilePreviewLinks,
  buildProfilePublicViewModel,
  buildProfileSaveState,
} from '@/features/profile/view-models';
import type { Artist } from '@/types/db';

const mockArtist: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'testartist',
  spotify_id: 'spotify-123',
  name: 'Test Artist',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Test tagline',
  theme: {},
  settings: { hide_branding: true },
  spotify_url: undefined,
  apple_music_url: undefined,
  youtube_url: undefined,
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00Z',
};

describe('profile view models', () => {
  it('builds a normalized public profile model', () => {
    const viewModel = buildProfilePublicViewModel({
      mode: 'tour',
      artist: mockArtist,
      socialLinks: [],
      contacts: [],
      showTipButton: true,
    });

    expect(viewModel.mode).toBe('tour');
    expect(viewModel.subtitle).toBe('Tour dates');
    expect(viewModel.showBackButton).toBe(true);
    expect(viewModel.showNotificationButton).toBe(true);
    expect(viewModel.isTourModeActive).toBe(true);
  });

  it('normalizes profile identity fields for editors', () => {
    expect(buildProfileIdentityFields(mockArtist)).toEqual({
      username: 'testartist',
      displayName: 'Test Artist',
      name: 'Test Artist',
      tagline: 'Test tagline',
      imageUrl: 'https://example.com/avatar.jpg',
      hideBranding: true,
      profilePath: '/testartist',
    });
  });

  it('creates preview links and save state defaults', () => {
    expect(
      buildProfilePreviewLinks([
        {
          id: 'instagram',
          platform: 'instagram',
          title: null,
          url: 'https://instagram.com/testartist',
        },
      ])
    ).toEqual([
      {
        id: 'instagram',
        platform: 'instagram',
        title: 'instagram',
        url: 'https://instagram.com/testartist',
        isVisible: true,
      },
    ]);

    expect(buildProfileSaveState()).toEqual({
      saving: false,
      success: null,
      error: null,
    });
  });
});
