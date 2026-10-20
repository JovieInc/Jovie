import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsBenefitsSection } from './ArtistNotificationsBenefitsSection';

describe('ArtistNotificationsBenefitsSection', () => {
  it('stamps the three-column benefits grid as feature-grid 3-large', () => {
    render(
      <ArtistNotificationsBenefitsSection
        benefits={ARTIST_NOTIFICATIONS_COPY.benefits}
      />
    );

    const section = screen.getByTestId('marketing-section-feature-grid');
    expect(section).toHaveAttribute('data-marketing-variant', '3-large');
    expect(section).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/artist-notifications/ArtistNotificationsBenefitsSection.tsx'
    );
    expect(screen.getAllByRole('article')).toHaveLength(
      ARTIST_NOTIFICATIONS_COPY.benefits.items.length
    );
  });
});
