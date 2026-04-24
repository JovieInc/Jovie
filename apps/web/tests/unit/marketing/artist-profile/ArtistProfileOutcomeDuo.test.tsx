import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileOutcomeDuo } from '@/components/marketing/artist-profile/ArtistProfileOutcomeDuo';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

describe('ArtistProfileOutcomeDuo', () => {
  it('renders the marketing headline + both card labels + both drawer titles', () => {
    render(
      <ArtistProfileOutcomeDuo
        headline={ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline}
        duo={ARTIST_PROFILE_COPY.outcomeDuo}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: ARTIST_PROFILE_COPY.outcomeDuo.cards.getPaid.label,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: ARTIST_PROFILE_COPY.outcomeDuo.cards.sellOut.label,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(ARTIST_PROFILE_COPY.outcomeDuo.cards.getPaid.drawerTitle)
    ).toBeInTheDocument();
    expect(
      screen.getByText(ARTIST_PROFILE_COPY.outcomeDuo.cards.sellOut.drawerTitle)
    ).toBeInTheDocument();
  });

  it('renders every tip amount and the Venmo CTA inside the Pay drawer', () => {
    render(
      <ArtistProfileOutcomeDuo
        headline={ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline}
        duo={ARTIST_PROFILE_COPY.outcomeDuo}
      />
    );

    for (const row of ARTIST_PROFILE_COPY.outcomeDuo.cards.getPaid.amountRows) {
      expect(screen.getByText(row.amount)).toBeInTheDocument();
    }

    expect(
      screen.getByText(ARTIST_PROFILE_COPY.outcomeDuo.cards.getPaid.ctaLabel)
    ).toBeInTheDocument();
  });

  it('renders every tour row venue in the Tour Dates drawer', () => {
    render(
      <ArtistProfileOutcomeDuo
        headline={ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline}
        duo={ARTIST_PROFILE_COPY.outcomeDuo}
      />
    );

    for (const row of ARTIST_PROFILE_COPY.outcomeDuo.cards.sellOut.drawerRows) {
      expect(screen.getByText(row.venue)).toBeInTheDocument();
    }
  });

  it('uses the headline prop — homepage variant overrides the marketing headline', () => {
    const customHeadline = 'Custom homepage headline.';
    render(
      <ArtistProfileOutcomeDuo
        headline={customHeadline}
        duo={ARTIST_PROFILE_COPY.outcomeDuo}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: customHeadline })
    ).toBeInTheDocument();
  });
});
