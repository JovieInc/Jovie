import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingProfileRail } from '@/components/features/onboarding/OnboardingProfileRail';
import { fastRender } from '@/tests/utils/fast-render';

describe('OnboardingProfileRail', () => {
  it('renders the actual profile surface inside the shared phone frame', () => {
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: {
            id: 'artist-1',
            name: 'Test Artist',
            url: 'https://open.spotify.com/artist/artist-1',
            imageUrl: 'https://i.scdn.co/image/test',
            followers: 12_300,
            popularity: 48,
            genres: ['progressive house'],
            dspMatches: [
              {
                id: 'apple-music',
                label: 'Apple Music',
                platform: 'applemusic',
                url: 'https://music.apple.com/us/artist/test-artist',
              },
            ],
          },
          artistConfirmed: true,
          handle: 'testartist',
          socialLinks: ['https://instagram.com/testartist'],
        }}
      />
    );

    expect(screen.getByTestId('onboarding-profile-rail')).toHaveAttribute(
      'data-visible',
      'true'
    );
    expect(screen.getByTestId('onboarding-profile-bento')).toBeDefined();
    expect(screen.getByTestId('onboarding-phone-preview')).toBeDefined();
    expect(
      screen.getByTestId('onboarding-profile-compact-surface')
    ).toBeDefined();
    expect(screen.getByTestId('profile-compact-surface')).toBeDefined();
    expect(screen.getAllByText('Test Artist')).toHaveLength(1);
    expect(
      within(screen.getByTestId('onboarding-phone-preview')).getByText(
        'Test Artist'
      )
    ).toBeDefined();
    expect(screen.getAllByTitle('Spotify').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Apple Music').length).toBeGreaterThan(0);
    expect(screen.queryByText('open.spotify.com')).toBeNull();
    expect(screen.getByText('12.3K Spotify followers')).toBeDefined();
    expect(screen.queryByTestId('onboarding-rail-progress')).toBeNull();
    expect(screen.queryByText('Artist Profile')).toBeNull();
    expect(screen.queryByText('Building profile')).toBeNull();
    expect(screen.queryByText('Building Test Artist')).toBeNull();
  });

  it('omits unsafe artist profile links', () => {
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: {
            id: 'artist-1',
            name: 'Test Artist',
            url: 'javascript:alert(1)',
            followers: 12_300,
            popularity: 48,
            genres: ['progressive house'],
          },
          artistConfirmed: true,
          handle: null,
          socialLinks: [],
        }}
      />
    );

    expect(screen.queryByTestId('onboarding-dsp-match-strip')).toBeNull();
    expect(
      screen
        .queryAllByRole('link')
        .some(link => link.getAttribute('href') === 'javascript:alert(1)')
    ).toBe(false);
  });

  it('omits DSP matches whose urls do not belong to the claimed platform', () => {
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: {
            id: 'artist-1',
            name: 'Test Artist',
            url: 'https://open.spotify.com/artist/artist-1',
            followers: 12_300,
            popularity: 48,
            genres: ['progressive house'],
            dspMatches: [
              {
                id: 'apple-music',
                label: 'Apple Music',
                platform: 'applemusic',
                url: 'https://example.com/music.apple.com/fake',
              },
            ],
          },
          artistConfirmed: true,
          handle: 'testartist',
          socialLinks: ['https://evil.test/instagram.com/testartist'],
        }}
      />
    );

    expect(screen.getAllByTitle('Spotify').length).toBeGreaterThan(0);
    expect(screen.queryByTitle('Apple Music')).toBeNull();
    expect(
      screen
        .queryAllByRole('link')
        .some(link => link.getAttribute('href')?.includes('evil.test'))
    ).toBe(false);
  });
});
