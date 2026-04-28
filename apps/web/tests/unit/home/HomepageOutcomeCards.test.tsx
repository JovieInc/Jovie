import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageOutcomeCards } from '@/components/homepage/HomepageOutcomeCards';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

describe('HomepageOutcomeCards', () => {
  it('renders the artist profile outcome cards on the homepage', () => {
    render(
      <HomepageOutcomeCards
        headline={ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline}
        outcomes={ARTIST_PROFILE_COPY.outcomes}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline,
      })
    ).toBeInTheDocument();

    expect(screen.getAllByTestId('homepage-outcome-card')).toHaveLength(
      ARTIST_PROFILE_COPY.outcomes.cards.length
    );

    for (const card of ARTIST_PROFILE_COPY.outcomes.cards) {
      expect(
        screen.getByRole('heading', { level: 3, name: card.title })
      ).toBeInTheDocument();
      expect(screen.queryByText(card.description)).not.toBeInTheDocument();
    }
  });

  it('keeps the copied artist profile proof content in the homepage cards', () => {
    render(
      <HomepageOutcomeCards
        headline={ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline}
        outcomes={ARTIST_PROFILE_COPY.outcomes}
      />
    );

    expect(
      screen.getByText(
        ARTIST_PROFILE_COPY.outcomes.syntheticProofs.visualProofs.getPaid
          .ctaLabel
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        ARTIST_PROFILE_COPY.outcomes.syntheticProofs.visualProofs.sellOut
          .drawerRows[0].venue
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        ARTIST_PROFILE_COPY.outcomes.syntheticProofs.shareAnywhere.url
      )
    ).toBeInTheDocument();
  });
});
