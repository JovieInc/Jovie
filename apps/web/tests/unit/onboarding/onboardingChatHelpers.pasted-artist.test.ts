import { describe, expect, it } from 'vitest';
import { spotifyArtistIdFromPastedText } from '@/components/features/onboarding/onboardingChatHelpers';

const ID = '4Uwpa6zW3zzCSQvooQNksm';
const OTHER = '0TnOYISbd1XYRBk9myaseg';

describe('spotifyArtistIdFromPastedText', () => {
  it('reads exact identity from a pasted artist link, with or without chatter', () => {
    expect(
      spotifyArtistIdFromPastedText(`https://open.spotify.com/artist/${ID}`)
    ).toBe(ID);
    expect(
      spotifyArtistIdFromPastedText(
        `hey this is me https://open.spotify.com/artist/${ID}?si=abc thanks`
      )
    ).toBe(ID);
    expect(
      spotifyArtistIdFromPastedText(
        `https://open.spotify.com/intl-de/artist/${ID}`
      )
    ).toBe(ID);
  });

  it('never guesses: no link, a track link, a lookalike host, or two artists yield null', () => {
    expect(spotifyArtistIdFromPastedText('I make indie pop')).toBeNull();
    expect(
      spotifyArtistIdFromPastedText(`https://open.spotify.com/track/${ID}`)
    ).toBeNull();
    expect(
      spotifyArtistIdFromPastedText(
        `https://open.spotify.com.evil.io/artist/${ID}`
      )
    ).toBeNull();
    expect(
      spotifyArtistIdFromPastedText(
        `https://open.spotify.com/artist/${ID} https://open.spotify.com/artist/${OTHER}`
      )
    ).toBeNull();
  });
});
