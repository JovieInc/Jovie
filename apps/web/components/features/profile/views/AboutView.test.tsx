import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { AboutView } from './AboutView';

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

describe('AboutView', () => {
  it('forwards selected credits and contacts to the About destination', () => {
    render(
      <AboutView
        artist={PROFILE_STORY_ARTIST}
        creditSegments={[
          { type: 'text', text: 'Credited on "' },
          {
            type: 'release',
            text: 'Neon Circuit',
            href: '/timwhite/neon-circuit',
          },
          { type: 'text', text: '".' },
        ]}
        contacts={[bookingContact]}
      />
    );

    expect(screen.getByTestId('profile-about-credits')).toBeVisible();
    expect(screen.getByTestId('profile-about-contacts')).toBeVisible();
    expect(screen.getByRole('link', { name: /Booking/ })).toHaveAttribute(
      'href',
      '/timwhite?mode=contact'
    );
  });

  it('omits credits and contact blocks when nothing is verified', () => {
    render(<AboutView artist={PROFILE_STORY_ARTIST} />);

    expect(screen.queryByTestId('profile-about-credits')).toBeNull();
    expect(screen.queryByTestId('profile-about-contacts')).toBeNull();
  });
});
