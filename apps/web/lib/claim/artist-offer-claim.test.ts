import { describe, expect, it } from 'vitest';
import {
  CLAIM_CHECKOUT_HREF,
  type ClaimArtist,
  type ClaimViewer,
  HIGH_PROFILE_FOLLOWER_THRESHOLD,
  isSpotifyArtistId,
  parseClaimPageState,
  requiresManualVerification,
  resolveClaimRedirect,
} from './artist-offer-claim';

const anonymous: ClaimViewer = {
  signedIn: false,
  isSubscriber: false,
  hasClaimedProfile: false,
};
const signedIn: ClaimViewer = { ...anonymous, signedIn: true };

const artist = (overrides: Partial<ClaimArtist> = {}): ClaimArtist => ({
  spotifyId: '4Z8W4fKeB5YxbusRsdQVPb',
  name: 'Indie Artist',
  followers: 1_200,
  profile: null,
  ...overrides,
});

describe('self-serve artist claim routing', () => {
  it('never charges an existing subscriber twice', () => {
    expect(
      resolveClaimRedirect({
        viewer: { ...signedIn, isSubscriber: true, hasClaimedProfile: true },
        artist: artist(),
      })
    ).toBe('/claim?state=already_subscribed');
  });

  it('sends an artist with a claimed profile straight to checkout', () => {
    expect(
      resolveClaimRedirect({
        viewer: { ...signedIn, hasClaimedProfile: true },
        artist: null,
      })
    ).toBe(CLAIM_CHECKOUT_HREF);
    expect(CLAIM_CHECKOUT_HREF).toBe(
      '/onboarding/checkout?plan=pro&interval=month&source=intent'
    );
  });

  it('refuses a profile someone else already claimed', () => {
    expect(
      resolveClaimRedirect({
        viewer: anonymous,
        artist: artist({ profile: { username: 'indie', isClaimed: true } }),
      })
    ).toBe('/claim?state=already_claimed');
  });

  it('never self-serves a famous artist, with or without a Jovie profile', () => {
    for (const profile of [
      null,
      { username: 'famous', isClaimed: false },
    ] as const) {
      expect(
        resolveClaimRedirect({
          viewer: signedIn,
          artist: artist({
            followers: HIGH_PROFILE_FOLLOWER_THRESHOLD,
            profile,
          }),
        })
      ).toBe('/claim?state=verification_required');
    }
  });

  it('reuses the proof-checked claim route for an unclaimed profile', () => {
    expect(
      resolveClaimRedirect({
        viewer: anonymous,
        artist: artist({ profile: { username: 'indie', isClaimed: false } }),
      })
    ).toBe('/indie/claim?next=auth');
  });

  it('creates a new profile with Pro monthly intent for a new artist', () => {
    const href = resolveClaimRedirect({ viewer: anonymous, artist: artist() });
    const url = new URL(href, 'https://jov.ie');
    expect(url.pathname).toBe('/signup');
    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('interval')).toBe('month');
    expect(url.searchParams.get('spotify_url')).toBe(
      'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb'
    );
    expect(url.searchParams.get('artist_name')).toBe('Indie Artist');
  });

  it('routes create-without-Spotify to signup or onboarding', () => {
    expect(resolveClaimRedirect({ viewer: anonymous, artist: null })).toBe(
      '/signup?plan=pro&interval=month'
    );
    expect(resolveClaimRedirect({ viewer: signedIn, artist: null })).toBe(
      '/start'
    );
  });

  it('treats unknown reach as not famous and validates inputs', () => {
    expect(requiresManualVerification(null)).toBe(false);
    expect(requiresManualVerification(Number.NaN)).toBe(false);
    expect(requiresManualVerification(99_999)).toBe(false);
    expect(requiresManualVerification(100_000)).toBe(true);
    expect(isSpotifyArtistId('4Z8W4fKeB5YxbusRsdQVPb')).toBe(true);
    expect(isSpotifyArtistId('../../etc')).toBe(false);
    expect(parseClaimPageState('checkout_canceled')).toBe('checkout_canceled');
    expect(parseClaimPageState(['already_claimed'])).toBe('already_claimed');
    expect(parseClaimPageState('<script>')).toBeNull();
  });
});
