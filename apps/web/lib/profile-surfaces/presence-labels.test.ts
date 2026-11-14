import { describe, expect, it } from 'vitest';
import {
  getPresenceEntityName,
  getPresenceHandle,
  getPresencePlatformLabel,
  getPresenceRowTitle,
} from './presence-identity';

describe('canonical platform names and valid handles', () => {
  it.each([
    ['youtube', 'YouTube'],
    ['instagram', 'Instagram'],
    ['tiktok', 'TikTok'],
    ['line', 'LINE'],
    ['website', 'Website'],
    ['linkedin', 'LinkedIn'],
    ['github', 'GitHub'],
    ['paypal', 'PayPal'],
    ['whatsapp', 'WhatsApp'],
  ])('renders the canonical platform name for %s', (platform, expected) => {
    expect(getPresencePlatformLabel({ platform })).toBe(expected);
  });

  it('collapses platform-derived labels to the canonical platform name', () => {
    expect(
      getPresenceRowTitle({ platform: 'tiktok', label: 'tiktok' }, 'Tim White')
    ).toBe('TikTok');
    expect(
      getPresenceRowTitle({ platform: 'line', label: 'Line' }, 'Tim White')
    ).toBe('LINE');
    expect(
      getPresenceRowTitle(
        { platform: 'spotify', label: 'SPOTIFY' },
        'Tim White'
      )
    ).toBe('Spotify');
    // Correctly branded and lowercase labels both canonicalize.
    expect(
      getPresenceRowTitle(
        { platform: 'linkedin', label: 'LinkedIn' },
        'Tim White'
      )
    ).toBe('LinkedIn');
    expect(
      getPresenceRowTitle(
        { platform: 'linkedin', label: 'linkedin' },
        'Tim White'
      )
    ).toBe('LinkedIn');
    expect(
      getPresenceRowTitle({ platform: 'paypal', label: 'paypal' }, 'Tim White')
    ).toBe('PayPal');
    // Custom titles are never rewritten.
    expect(
      getPresenceRowTitle(
        { platform: 'line', label: 'Tim on LINE' },
        'Tim White'
      )
    ).toBe('Tim on LINE');
    expect(
      getPresenceRowTitle(
        { platform: 'venmo', label: 'Tip on Venmo' },
        'Tim White'
      )
    ).toBe('Tip on Venmo');
  });

  it('normalizes a platform-restating connector label without touching custom titles', () => {
    expect(
      getPresenceEntityName(
        { kind: 'connector', platform: 'gmail', label: 'GMAIL' },
        'Tim White'
      )
    ).toBe('Gmail');
    expect(
      getPresenceEntityName(
        { kind: 'connector', platform: 'gmail', label: "Tim's email" },
        'Tim White'
      )
    ).toBe("Tim's email");
  });

  it('never infers a handle from a generic DSP /artist path', () => {
    expect(
      getPresenceHandle({
        kind: 'dsp',
        handle: null,
        url: 'https://open.spotify.com/artist?id=06HL4z0CvFAxyc27GXpf02',
      })
    ).toBeNull();
    expect(
      getPresenceHandle({
        kind: 'dsp',
        handle: null,
        url: 'https://music.apple.com/artist?id=1539',
      })
    ).toBeNull();
    expect(
      getPresenceHandle({
        kind: 'dsp',
        handle: null,
        url: 'https://unknown-provider.example/artist',
      })
    ).toBeNull();
    // Casing and percent-encoding do not bypass the generic-route check.
    expect(
      getPresenceHandle({
        kind: 'dsp',
        handle: null,
        url: 'https://open.spotify.com/Artist?id=1539',
      })
    ).toBeNull();
    expect(
      getPresenceHandle({
        kind: 'dsp',
        handle: null,
        url: 'https://open.spotify.com/%61rtist?id=1539',
      })
    ).toBeNull();
  });

  it('preserves username-rooted /artist paths and explicit handles on social platforms', () => {
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://instagram.com/artist',
      })
    ).toBe('@artist');
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://instagram.com/Artist',
      })
    ).toBe('@Artist');
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://instagram.com/%40artist',
      })
    ).toBe('@artist');
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://www.tiktok.com/@artist',
      })
    ).toBe('@artist');
    // A stored handle always wins over URL inference.
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: 'artist',
        url: 'https://open.spotify.com/artist?id=06HL4z0CvFAxyc27GXpf02',
      })
    ).toBe('@artist');
  });

  it('still infers handles from legitimate social profile paths', () => {
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://instagram.com/timwhite',
      })
    ).toBe('@timwhite');
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://www.tiktok.com/@timwhite',
      })
    ).toBe('@timwhite');
    expect(
      getPresenceHandle({
        kind: 'social',
        handle: null,
        url: 'https://youtube.com/@timwhite',
      })
    ).toBe('@timwhite');
  });
});
