import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingProfileRail } from '@/components/features/onboarding/OnboardingProfileRail';
import { fastRender } from '@/tests/utils/fast-render';

describe('OnboardingProfileRail', () => {
  it('renders a progressive profile timeline from onboarding state', () => {
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
    expect(screen.getByText('Building Test Artist')).toBeDefined();
    expect(screen.getByText('Matched')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Open Test Artist on Spotify' })
    ).toHaveAttribute('href', 'https://open.spotify.com/artist/artist-1');
    expect(screen.queryByText('open.spotify.com')).toBeNull();
    expect(screen.getByTitle('12,300 Spotify followers')).toBeDefined();
    expect(screen.getByText('12,300 Spotify followers')).toBeDefined();
    expect(screen.getByTitle('Popularity score: 48 out of 100')).toBeDefined();
    expect(screen.getByText('Popularity score: 48 out of 100')).toBeDefined();
    expect(screen.getByText('Genre: Progressive House')).toBeDefined();
    expect(screen.getByText('Progressive House')).toBeDefined();
    expect(screen.getByText('jov.ie/testartist')).toBeDefined();
    expect(screen.getByText('instagram.com')).toBeDefined();
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

    expect(screen.queryByRole('link')).toBeNull();
  });
});
