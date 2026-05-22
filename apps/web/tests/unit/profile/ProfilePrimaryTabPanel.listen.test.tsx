import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryTabPanel } from '@/features/profile/ProfilePrimaryTabPanel';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';

const { releasesViewMock } = vi.hoisted(() => ({
  releasesViewMock: vi.fn(),
}));

vi.mock('@/features/profile/views/ReleasesView', () => ({
  ReleasesView: (props: { readonly artistId: string }) => {
    releasesViewMock(props);
    return (
      <div data-artist-id={props.artistId} data-testid='mock-releases-view'>
        Releases
      </div>
    );
  },
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: ({
      triggerLabel,
      source,
    }: {
      readonly triggerLabel?: string;
      readonly source?: string;
    }) => (
      <button data-source={source} data-testid='mock-alert-cta' type='button'>
        {triggerLabel ?? 'Get alerts'}
      </button>
    ),
  })
);

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: () => (
    <div data-testid='mock-static-listen-interface'>Listen providers</div>
  ),
}));

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  name: 'Dua Lipa',
  handle: 'dualipa',
  spotify_id: 'artist-spotify-id',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_verified: true,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
  settings: null,
} satisfies Artist;

const contentPrefs: Record<NotificationContentType, boolean> = {
  newMusic: false,
  tourDates: false,
  merch: false,
  general: false,
};

const dsps: AvailableDSP[] = [
  {
    key: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/artist-spotify-id',
    config: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
];

describe('ProfilePrimaryTabPanel listen mode', () => {
  it('renders releases as the Music tab surface without redundant DSP actions', () => {
    render(
      <ProfilePrimaryTabPanel
        mode='listen'
        artist={artist}
        dsps={dsps}
        isSubscribed={false}
        contentPrefs={contentPrefs}
        onTogglePref={vi.fn()}
        onUnsubscribe={vi.fn()}
        isUnsubscribing={false}
        releases={[
          {
            id: 'release-1',
            title: 'Training Season',
            slug: 'training-season',
            releaseType: 'single',
            releaseDate: '2026-04-24',
            artworkUrl: null,
            artistNames: ['Dua Lipa'],
          },
        ]}
      />
    );

    expect(screen.getByTestId('mock-releases-view')).toBeVisible();
    expect(screen.getByTestId('mock-releases-view')).toHaveAttribute(
      'data-artist-id',
      'artist-1'
    );
    expect(
      screen.queryByTestId('mock-static-listen-interface')
    ).not.toBeInTheDocument();
    expect(releasesViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ artistId: 'artist-1' })
    );
  });

  it('renders a sparse no-music alert empty state', () => {
    render(
      <ProfilePrimaryTabPanel
        mode='listen'
        artist={artist}
        dsps={dsps}
        isSubscribed={false}
        contentPrefs={contentPrefs}
        onTogglePref={vi.fn()}
        onUnsubscribe={vi.fn()}
        isUnsubscribing={false}
        releases={[]}
      />
    );

    expect(screen.getByText('No Music')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Turn on alerts' })
    ).toHaveAttribute('data-source', 'music_empty_state');
  });
});
