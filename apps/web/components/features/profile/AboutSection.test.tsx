import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import { AboutSection } from './AboutSection';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

describe('AboutSection', () => {
  it('renders selected credits and booking/contact entries when provided', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        creditSegments={[
          {
            type: 'text',
            text: "Tim White's credited collaborators include ",
          },
          {
            type: 'artist',
            text: 'Guest Vocalist',
            href: '/guestvocalist',
          },
          { type: 'text', text: ' on "' },
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

    const credits = screen.getByTestId('profile-about-credits');
    expect(credits).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Guest Vocalist' })
    ).toHaveAttribute('href', '/guestvocalist');
    expect(screen.getByRole('link', { name: 'Neon Circuit' })).toHaveAttribute(
      'href',
      '/timwhite/neon-circuit'
    );

    const contacts = screen.getByTestId('profile-about-contacts');
    expect(contacts).toBeVisible();
    expect(screen.getByRole('link', { name: /Booking/ })).toHaveAttribute(
      'href',
      '/timwhite?mode=contact'
    );
  });

  it('omits credits and contact blocks on sparse profiles', () => {
    render(<AboutSection artist={PROFILE_STORY_ARTIST} contacts={[]} />);

    expect(screen.queryByTestId('profile-about-credits')).toBeNull();
    expect(screen.queryByTestId('profile-about-contacts')).toBeNull();
  });

  it('skips contacts with no reachable channel', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        contacts={[{ ...bookingContact, channels: [] }]}
      />
    );

    expect(screen.queryByTestId('profile-about-contacts')).toBeNull();
  });
});
