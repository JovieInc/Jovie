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
});
