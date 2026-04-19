import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArtistNotificationsPage from '@/app/(marketing)/artist-notifications/page';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_NOTIFICATIONS_SECTION_ORDER } from '@/data/artistNotificationsPageOrder';

function expectArtistNotificationsSectionOrder() {
  const sectionTestIds = ARTIST_NOTIFICATIONS_SECTION_ORDER.map(
    section => section.testId
  );

  for (const testId of sectionTestIds) {
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  }

  for (let index = 0; index < sectionTestIds.length - 1; index += 1) {
    const current = screen.getByTestId(sectionTestIds[index]);
    const next = screen.getByTestId(sectionTestIds[index + 1]);

    expect(
      Boolean(
        current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  }
}

describe('ArtistNotificationsPage', () => {
  it('renders the notifications landing page with shared artist-profile sections', () => {
    render(<ArtistNotificationsPage />);

    expectArtistNotificationsSectionOrder();

    const heroSection = within(
      screen.getByTestId('artist-notifications-section-hero')
    );
    expect(
      heroSection.getByRole('heading', {
        name: 'Reach Every Fan. Automatically.',
      })
    ).toBeInTheDocument();
    expect(
      heroSection.getByRole('link', { name: 'Start Pro Trial' })
    ).toHaveAttribute('href', '/signup?plan=pro');
    expect(heroSection.queryByText('Capture once')).not.toBeInTheDocument();

    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByText('Trusted by artists on')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Capture every fan.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Turn streams, show traffic, QR scans, and support moments into a fan list Jovie can bring back.'
      )
    ).toBeInTheDocument();

    const reactivationSection = within(
      screen.getByTestId('artist-notifications-section-reactivation')
    );
    expect(
      reactivationSection.getByRole('heading', {
        name: 'Notify them automatically.',
      })
    ).toBeInTheDocument();
    expect(
      reactivationSection.getByText('New music gets another listening moment.')
    ).toBeInTheDocument();
    expect(
      reactivationSection.getByText(
        'Subscribers go straight to the latest release.'
      )
    ).toBeInTheDocument();
    for (const row of ARTIST_NOTIFICATIONS_COPY.reactivation.workflow.rows) {
      expect(reactivationSection.getByText(row.trigger)).toBeInTheDocument();
    }
    expect(
      reactivationSection.queryByText('Video Live')
    ).not.toBeInTheDocument();
    expect(
      reactivationSection.queryByText('Support Received')
    ).not.toBeInTheDocument();

    const benefitsSection = within(
      screen.getByTestId('artist-notifications-section-benefits')
    );
    expect(
      benefitsSection.getByRole('heading', {
        name: 'Bring fans back when it matters.',
      })
    ).toBeInTheDocument();
    expect(
      benefitsSection.getByText('New music gets another listening moment.')
    ).toBeInTheDocument();
    expect(
      benefitsSection.getByText('Nearby shows get another ticket window.')
    ).toBeInTheDocument();
    expect(
      benefitsSection.getByText('You stay close without writing blasts.')
    ).toBeInTheDocument();

    const specWallSection = within(
      screen.getByTestId('artist-notifications-section-spec-wall')
    );
    for (const tile of ARTIST_NOTIFICATIONS_SPEC_TILES) {
      expect(
        specWallSection.getByRole('heading', { name: tile.title })
      ).toBeInTheDocument();
    }
    expect(
      specWallSection.queryByText('Power features')
    ).not.toBeInTheDocument();

    const faqSection = within(
      screen.getByTestId('artist-notifications-section-faq')
    );
    expect(
      faqSection.getByText('How does Jovie bring fans back?')
    ).toBeInTheDocument();
    expect(
      faqSection.getByText(
        'What kinds of moments can Jovie turn into notifications?'
      )
    ).toBeInTheDocument();
    expect(
      faqSection.getByText('Why use Jovie instead of writing email campaigns?')
    ).toBeInTheDocument();
    expect(
      faqSection.getByText('Where do fans land after they click?')
    ).toBeInTheDocument();
    expect(
      faqSection.getByText('When does it make sense to turn on Pro?')
    ).toBeInTheDocument();

    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Ready to Amplify?'
    );
    expect(screen.getByTestId('final-cta-action')).toHaveAttribute(
      'href',
      '/signup?plan=pro'
    );

    for (const bannedCopy of [
      'Owned audience',
      'Automatic reactivation',
      'Fan outcomes',
      'Power features',
    ]) {
      expect(screen.queryByText(bannedCopy)).not.toBeInTheDocument();
    }
  });
});
