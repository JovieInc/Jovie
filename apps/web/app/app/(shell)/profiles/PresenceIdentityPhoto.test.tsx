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
    expect(photo).toHaveAttribute(
      'aria-label',
      'No profile photo for Tim on Tidal'
    );
  });
});
