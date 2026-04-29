import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const compactPreviewMountIds: string[] = [];

vi.mock('@/features/profile/templates/ProfileCompactTemplate', () => ({
  ProfileCompactTemplate: (props: Record<string, unknown>) => {
    const mountIdRef = React.useRef(
      `compact-${(props.artist as Artist)?.id}-${compactPreviewMountIds.length + 1}`
    );
    if (!compactPreviewMountIds.includes(mountIdRef.current)) {
      compactPreviewMountIds.push(mountIdRef.current);
    }

    return React.createElement('div', {
      'data-testid': 'profile-compact-template',
      'data-mode': props.mode,
      'data-artist-name': (props.artist as Artist)?.name,
      'data-show-subscription-confirmed-banner': String(
        props.showSubscriptionConfirmedBanner
      ),
      'data-hide-more-menu': String(props.hideMoreMenu),
      'data-mount-id': mountIdRef.current,
    });
  },
}));

const mockArtist = {
  id: 'test-id',
  owner_user_id: 'owner-1',
  spotify_id: 'spotify-test-id',
  handle: 'testartist',
  name: 'Test Artist',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  target_playlists: null,
  active_since_year: null,
  genres: null,
  settings: {},
  theme: {},
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00.000Z',
} as unknown as Artist;

const mockSocialLinks = [
  {
    id: 'link-1',
    artist_id: 'test-id',
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/123',
    clicks: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
];

describe('StaticArtistPage', () => {
  afterEach(() => {
    compactPreviewMountIds.length = 0;
    cleanup();
    vi.resetModules();
  });

  it('defaults to the full public profile presentation', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showBackButton={false}
      />
    );

    expect(screen.getByTestId('profile-compact-template')).toBeInTheDocument();
  });

  it('renders the compact preview presentation when requested', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        presentation='compact-preview'
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showBackButton={false}
      />
    );

    expect(screen.getByTestId('profile-compact-template')).toBeInTheDocument();
  });

  it('forwards mode to the live compact presentation by default', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        mode='listen'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Listen'
        showBackButton={true}
      />
    );

    expect(
      screen.getByTestId('profile-compact-template').getAttribute('data-mode')
    ).toBe('listen');
  });

  it('forwards preview-only props to the compact presentation', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        presentation='compact-preview'
        mode='tour'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Tour dates'
        showBackButton={true}
        showSubscriptionConfirmedBanner
      />
    );

    const template = screen.getByTestId('profile-compact-template');
    expect(template.getAttribute('data-mode')).toBe('tour');
    expect(
      template.getAttribute('data-show-subscription-confirmed-banner')
    ).toBe('true');
  });

  it('forwards demo chrome controls to the compact presentation', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        presentation='compact-preview'
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showBackButton={false}
        hideMoreMenu
      />
    );

    expect(screen.getByTestId('profile-compact-template')).toHaveAttribute(
      'data-hide-more-menu',
      'true'
    );
  });

  it('remounts the active renderer when artist identity changes', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    const { rerender } = render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showBackButton={false}
      />
    );

    const firstMountId = screen
      .getByTestId('profile-compact-template')
      .getAttribute('data-mount-id');

    rerender(
      <StaticArtistPage
        mode='profile'
        artist={{
          ...mockArtist,
          id: 'test-id-2',
          handle: 'testartist-2',
          name: 'Test Artist 2',
        }}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showBackButton={false}
      />
    );

    const secondMountId = screen
      .getByTestId('profile-compact-template')
      .getAttribute('data-mount-id');

    expect(firstMountId).not.toBe(secondMountId);
  });
});
