import { describe, expect, it } from 'vitest';
import { resolveHasMusicLinks } from './music-link-presence';

const none = { dspSocialLinkCount: 0, releaseListenLinkCount: 0 };

describe('resolveHasMusicLinks', () => {
  it('is false only when nothing streamable is on the page', () => {
    expect(resolveHasMusicLinks(none)).toBe(false);
    expect(resolveHasMusicLinks({ ...none, spotifyUrl: '  ' })).toBe(false);
  });

  it('counts release listen links even with no DSP social links', () => {
    expect(resolveHasMusicLinks({ ...none, releaseListenLinkCount: 3 })).toBe(
      true
    );
  });

  it('counts profile Spotify/Apple Music urls', () => {
    expect(
      resolveHasMusicLinks({
        ...none,
        spotifyUrl: 'https://open.spotify.com/artist/1',
      })
    ).toBe(true);
    expect(
      resolveHasMusicLinks({
        ...none,
        appleMusicUrl: 'https://music.apple.com/a/1',
      })
    ).toBe(true);
  });
});
