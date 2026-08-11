import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileOutcomesCarousel } from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

describe('ArtistProfileOutcomesCarousel (feature-grid 4-ledger)', () => {
  it('renders the shipped four-row outcomes ledger as a semantic <ol>', () => {
    const { container } = render(
      <ArtistProfileOutcomesCarousel outcomes={ARTIST_PROFILE_COPY.outcomes} />
    );

    const ledger = screen.getByRole('list', { name: 'Fan Outcomes' });
    expect(ledger.tagName).toBe('OL');

    const rows = screen.getAllByTestId('artist-profile-outcome-card');
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.tagName).toBe('LI');
    }

    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map(heading => heading.textContent);
    expect(titles).toEqual(
      ARTIST_PROFILE_COPY.outcomes.landingCards
        .slice(0, 4)
        .map(card => card.title)
    );

    expect(
      container.querySelector(
        `[data-pen-contract="${MARKETING_PEN_CONTRACT_IDS.section.featureGrid}"]`
      )
    ).not.toBeNull();
  });
});
