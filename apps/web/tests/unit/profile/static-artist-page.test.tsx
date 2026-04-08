/**
 * Unit tests for StaticArtistPage.
 *
 * StaticArtistPage is now a thin wrapper that always renders
 * ProfileCompactTemplate. These tests verify props are forwarded correctly.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const mountIds: string[] = [];

// Mock the compact template
vi.mock('@/features/profile/templates/ProfileCompactTemplate', () => ({
  ProfileCompactTemplate: (props: Record<string, unknown>) => {
    const mountIdRef = React.useRef(
      `mount-${(props.artist as Artist)?.id}-${mountIds.length + 1}`
    );
    if (!mountIds.includes(mountIdRef.current)) {
      mountIds.push(mountIdRef.current);
    }

    return React.createElement('div', {
      'data-testid': 'profile-compact-template',
      'data-mode': props.mode,
      'data-artist-name': (props.artist as Artist)?.name,
      'data-show-subscription-confirmed-banner': String(
        props.showSubscriptionConfirmedBanner
      ),
      'data-mount-id': mountIdRef.current,
    });
  },
}));

// Mock hooks used by ProfileCompactTemplate (shouldn't be needed since it's mocked,
// but the import chain may trigger them)
vi.mock('@/components/organisms/profile-shell', () => ({
  ProfileNotificationsContext: React.createContext(null),
  useProfileShell: () => ({ notificationsContextValue: null }),
}));

const mockArtist: Artist = {
  id: 'test-id',
  name: 'Test Artist',
  handle: 'testartist',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_public: true,
  is_verified: false,
  active_since_year: null,
  published: true,
  is_verified_flag: false,
};

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
    mountIds.length = 0;
    cleanup();
  });

  it('renders the compact template', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Profile'
        showBackButton={false}
      />
    );

    expect(screen.getByTestId('profile-compact-template')).toBeInTheDocument();
  });

  it('forwards mode prop to compact template', async () => {
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

    const template = screen.getByTestId('profile-compact-template');
    expect(template.getAttribute('data-mode')).toBe('listen');
  });

  it('forwards artist to compact template', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Profile'
        showBackButton={false}
      />
    );

    const template = screen.getByTestId('profile-compact-template');
    expect(template.getAttribute('data-artist-name')).toBe('Test Artist');
  });

  it('forwards subscription confirmation banner state to compact template', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Profile'
        showBackButton={false}
        showSubscriptionConfirmedBanner
      />
    );

    const template = screen.getByTestId('profile-compact-template');
    expect(
      template.getAttribute('data-show-subscription-confirmed-banner')
    ).toBe('true');
  });

  it('remounts the compact template when artist identity changes', async () => {
    const { StaticArtistPage } = await import(
      '@/features/profile/StaticArtistPage'
    );

    const { rerender } = render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Profile'
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
        subtitle='Profile'
        showBackButton={false}
      />
    );

    const secondMountId = screen
      .getByTestId('profile-compact-template')
      .getAttribute('data-mount-id');

    expect(firstMountId).not.toBe(secondMountId);
  });
});
