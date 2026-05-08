import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryTabPanel } from '@/features/profile/ProfilePrimaryTabPanel';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';

vi.mock('@/features/profile/views/ReleasesView', () => ({
  ReleasesView: () => <div data-testid='mock-releases-view'>Releases</div>,
}));

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: ({
    dspsOverride = [],
  }: {
    readonly dspsOverride?: ReadonlyArray<AvailableDSP>;
  }) => (
    <div data-testid='mock-static-listen-interface'>
      {dspsOverride.map(dsp => (
        <button key={dsp.key} type='button'>
          {dsp.name}
        </button>
      ))}
    </div>
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
  it('renders releases and DSP actions together', () => {
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
    expect(screen.getByTestId('mock-static-listen-interface')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Spotify' })).toBeVisible();
  });
});
