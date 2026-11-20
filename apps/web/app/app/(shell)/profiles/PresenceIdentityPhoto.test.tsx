import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresenceIdentityPhoto } from './PresenceIdentityPhoto';

describe('PresenceIdentityPhoto', () => {
  it.each(['profile', 'generic'])(
    'never paints a background behind the %s avatar frame',
    kind => {
      const { container } = render(
        <PresenceIdentityPhoto
          artistName='Tim White'
          subject={{
            kind,
            platform: 'shazam',
            label: 'Shazam',
            handle: 'tim-white',
            url: 'https://www.shazam.com/artist/tim-white',
            monitoringState: 'monitored',
          }}
        />
      );

      // A background on the unrounded frame shows as a square behind the
      // circle/artwork on highlighted rows.
      const frame = container.querySelector('[data-slot="app-avatar-frame"]');
      expect(frame).not.toBeNull();
      expect(frame?.className).not.toMatch(/(^|\s)bg-/);
    }
  );
  it('keeps OG artwork out of the compact portrait slot and exposes its provenance', () => {
    const { getByTestId } = render(
      <PresenceIdentityPhoto
        size='sm'
        artistName='Tim'
        subject={{
          kind: 'dsp',
          platform: 'tidal',
          label: 'Tim',
          handle: null,
          url: 'https://tidal.com/artist/1',
          monitoringState: 'active',
          identityPhoto: {
            url: 'https://resources.tidal.com/artwork.jpg',
            source: 'public_metadata',
            kind: 'generic',
            verified: false,
            observedAt: null,
            freshness: 'unknown',
          },
        }}
      />
    );
    const photo = getByTestId('presence-identity-photo');
    expect(photo).toHaveAttribute('data-photo-kind', 'generic');
    expect(photo.querySelector('img')).toBeNull();
    // No artist monogram stands in for the platform on a compact row.
    const mark = getByTestId('presence-identity-platform-mark');
    // A bare icon, never a filled or bordered tile (design-noise icon-tile).
    expect(mark.className).not.toMatch(/\b(bg-|border|ring)/);
    expect(photo).not.toHaveTextContent('T');
    expect(photo).toHaveAttribute(
      'aria-label',
      'No profile photo for Tim on Tidal'
    );
  });

  it('keeps a verified portrait on the compact row', () => {
    const { getByTestId, queryByTestId } = render(
      <PresenceIdentityPhoto
        size='sm'
        artistName='Tim White'
        subject={{
          kind: 'dsp',
          platform: 'spotify',
          label: 'Spotify',
          handle: null,
          url: 'https://open.spotify.com/artist/1',
          monitoringState: 'active',
          identityPhoto: {
            url: 'https://i.scdn.co/image/portrait.jpg',
            source: 'connector',
            kind: 'profile',
            verified: true,
            observedAt: null,
            freshness: 'unknown',
          },
        }}
      />
    );
    expect(getByTestId('presence-identity-photo')).toHaveAttribute(
      'data-photo-kind',
      'profile'
    );
    expect(queryByTestId('presence-identity-platform-mark')).toBeNull();
  });
  it.each([
    ['website', 'example', /lucide/],
    ['authority', 'wikipedia', /lucide/],
  ])(
    'gives a compact %s row its own mark, not the generic link',
    (kind, platform, glyph) => {
      const { getByTestId } = render(
        <PresenceIdentityPhoto
          size='sm'
          artistName='Tim'
          subject={{
            kind,
            platform,
            label: 'Tim',
            handle: null,
            url: 'https://example.com',
            monitoringState: 'active',
          }}
        />
      );
      const svg = getByTestId('presence-identity-platform-mark').querySelector(
        'svg'
      );
      expect(svg?.getAttribute('class') ?? '').toMatch(glyph);
    }
  );
});
