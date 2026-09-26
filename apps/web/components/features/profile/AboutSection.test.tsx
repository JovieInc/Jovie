import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AboutSection } from './AboutSection';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

describe('AboutSection — About destination rows (JOV-6199 Wave 3)', () => {
  it('omits the selected credits and booking rows when no data backs them', () => {
    render(<AboutSection artist={PROFILE_STORY_ARTIST} />);

    expect(
      screen.queryByTestId('profile-about-selected-credits')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-about-booking-contacts')
    ).not.toBeInTheDocument();
  });

  it('renders linked collaborators in the selected credits row', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        selectedCredits={[
          { name: 'Guest Vocalist', handle: 'guestvocalist' },
          { name: 'Neon Circuit', handle: 'neoncircuit' },
        ]}
      />
    );

    const credits = screen.getByTestId('profile-about-selected-credits');
    expect(
      screen.getByRole('link', { name: 'Guest Vocalist' })
    ).toHaveAttribute('href', '/guestvocalist');
    expect(screen.getByRole('link', { name: 'Neon Circuit' })).toHaveAttribute(
      'href',
      '/neoncircuit'
    );
    expect(
      within(credits).getByRole('heading', { name: 'Selected Credits' })
    ).toBeInTheDocument();
  });

  it('renders booking and contact rows from the public contact payload', () => {
    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        bookingContacts={[
          {
            id: 'contact-1',
            role: 'booking',
            roleLabel: 'Booking',
            territorySummary: 'Worldwide',
            territoryCount: 1,
            channels: [
              { type: 'email', encoded: 'encoded-payload', preferred: true },
            ],
            contactName: 'Sam Bookit',
            companyLabel: 'Bookit Agency',
          },
        ]}
      />
    );

    const booking = screen.getByTestId('profile-about-booking-contacts');
    expect(within(booking).getByText('Booking')).toBeInTheDocument();
    expect(within(booking).getByText('Sam Bookit')).toBeInTheDocument();
    expect(within(booking).getByText('Bookit Agency')).toBeInTheDocument();
  });
});
