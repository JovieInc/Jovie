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
    const phonePreview = screen.getByTestId('onboarding-phone-preview');
    expect(
      within(phonePreview).getByTestId('profile-compact-surface')
    ).toBeDefined();
    expect(
      within(phonePreview).getAllByText('Test Artist').length
    ).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Spotify').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Apple Music').length).toBeGreaterThan(0);
    expect(screen.queryByText('open.spotify.com')).toBeNull();
    // The Pen identity header shows the name and jov.ie handle; the tagline
    // (here the enrichment follower count) is not repeated on Home.
    expect(
      within(phonePreview).getByTestId('profile-identity-handle')
    ).toHaveTextContent('jov.ie/testartist');
    expect(
      screen.getByTestId('onboarding-profile-preview-badge')
    ).toHaveTextContent('Preview');
    expect(screen.getByText('Preview · not claimed yet')).toBeDefined();
    expect(screen.queryByText('Manage')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByTestId('onboarding-rail-progress')).toBeNull();
    expect(screen.queryByText('Artist Profile')).toBeNull();
    expect(screen.queryByText('Building profile')).toBeNull();
    expect(screen.queryByText('Building Test Artist')).toBeNull();

    expect(screen.getByTestId('onboarding-profile-bento')).toBeInTheDocument();
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

  it('previews jov.ie/<handle> for a non-artist with a public profile', () => {
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: null,
          artistConfirmed: false,
          handle: 'avery',
          socialLinks: ['https://instagram.com/avery'],
        }}
      />
    );

    const phonePreview = screen.getByTestId('onboarding-phone-preview');
    expect(
      within(phonePreview).getByTestId('profile-identity-handle')
    ).toHaveTextContent('jov.ie/avery');
    expect(screen.queryAllByTitle('Spotify')).toHaveLength(0);
  });

  it('shows the draft profile for a claimed handle before any link is shared (Pen R6As7U)', () => {
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: null,
          artistConfirmed: false,
          handle: 'avery',
          socialLinks: [],
        }}
      />
    );

    const rail = screen.getByTestId('onboarding-profile-rail');
    expect(
      within(rail).getByRole('heading', { name: 'Your Draft Profile' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('onboarding-phone-preview')).getByTestId(
        'profile-identity-handle'
      )
    ).toHaveTextContent('jov.ie/avery');
  });

  // 2026-11-08 production: the draft profile showed an empty portrait and an
  // empty artwork square for an artist whose Spotify data had both. The
  // preview must paint the real media, straight from Spotify's CDN.
  it('shows the real Spotify portrait and release artwork when the source has them', () => {
    const portraitUrl =
      'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952';
    const artworkUrl =
      'https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58';
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: {
            id: '1ZlSI1juLMMN1HU8X7RViN',
            name: 'UNMARKED',
            url: 'https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN',
            imageUrl: portraitUrl,
            followers: 203,
            genres: [],
            catalog: {
              total: 1,
              releases: [
                {
                  id: 'vibe1',
                  title: 'Vibe',
                  releaseType: 'single',
                  releaseDate: '2024-05-01',
                  artworkUrl,
                  spotifyUrl: 'https://open.spotify.com/album/vibe1',
                },
              ],
            },
          },
          artistConfirmed: true,
          handle: 'unmarked',
          socialLinks: [],
        }}
      />
    );

    const phone = screen.getByTestId('onboarding-phone-preview');
    const portrait = within(phone)
      .getByTestId('profile-identity-portrait')
      .querySelector('img');
    expect(portrait, 'portrait fell back to a placeholder').not.toBeNull();
    expect(portrait?.getAttribute('src')).toBe(portraitUrl);
    const artwork = within(phone).getByRole('img', { name: 'Vibe artwork' });
    // Artwork still goes through the image optimizer; it must carry the
    // real Spotify artwork URL, never a placeholder.
    expect(decodeURIComponent(artwork.getAttribute('src') ?? '')).toContain(
      artworkUrl
    );
    // The artist keeps their own spelling; the UI never forces caps.
    expect(within(phone).getAllByText('UNMARKED').length).toBeGreaterThan(0);
    // Required fields are filled (mirrors expectRequiredFieldsPainted): the
    // release named by the artwork renders its title as text, the handle is
    // not blank, and nothing is left as a loading skeleton.
    expect(within(phone).getAllByText(/Vibe/).length).toBeGreaterThan(0);
    const handle = within(phone).getByTestId('profile-identity-handle');
    expect(handle.textContent?.split('/').pop()?.trim()).not.toBe('');
    expect(
      phone.querySelectorAll(
        '[aria-busy="true"], [data-skeleton], .animate-pulse, [class*="skeleton" i]'
      )
    ).toHaveLength(0);
  });

  it('renders nothing before a handle or profile is known', () => {
    fastRender(
      <OnboardingProfileRail
        state={{
          artist: null,
          artistConfirmed: false,
          handle: null,
          socialLinks: [],
        }}
      />
    );

    expect(screen.queryByTestId('onboarding-profile-rail')).toBeNull();
  });
});
