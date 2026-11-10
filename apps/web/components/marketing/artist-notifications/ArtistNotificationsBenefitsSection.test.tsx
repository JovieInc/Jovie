import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const OWN_WIDTH_CAP =
  /max-w-(?:300|315|280|4xl|6xl|linear-content)|--homepage-section-max/;

describe('single container width', () => {
  it.each([
    'components/marketing/artist-notifications/ArtistNotificationsBenefitsSection.tsx',
  ])('%s takes its width from the shared container, not its own cap', file => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(OWN_WIDTH_CAP);
  });
});
