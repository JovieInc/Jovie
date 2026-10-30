import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileOutcomeDuo } from './ArtistProfileOutcomeDuo';
import storyMeta, {
  Homepage,
  Marketing,
} from './ArtistProfileOutcomeDuo.stories';

describe('ArtistProfileOutcomeDuo', () => {
  it('renders the canonical conversion outcome drawers with bounded heading copy', () => {
    render(
      <ArtistProfileOutcomeDuo
        headline={ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline}
        duo={ARTIST_PROFILE_COPY.outcomeDuo}
      />
    );

    const section = screen.getByTestId('artist-profile-outcome-duo');
    expect(section).toHaveAttribute('aria-label', 'Artist Profiles Outcomes');
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline,
      })
    ).toHaveClass('line-clamp-2');

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(
      within(cards[0]).getByRole('heading', {
        level: 3,
        name: ARTIST_PROFILE_COPY.outcomeDuo.cards.getPaid.label,
      })
    ).toBeInTheDocument();
    expect(
      within(cards[1]).getByRole('heading', {
        level: 3,
        name: ARTIST_PROFILE_COPY.outcomeDuo.cards.sellOut.label,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Continue with Venmo')).toBeInTheDocument();
    expect(screen.getByText('The Novo')).toBeInTheDocument();
  });

  it('keeps the adjacent Storybook receipt bound to both headline variants', () => {
    expect(storyMeta.component).toBe(ArtistProfileOutcomeDuo);
    expect(Marketing.args?.headline).toBe(
      ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline
    );
    expect(Marketing.args?.duo).toBe(ARTIST_PROFILE_COPY.outcomeDuo);
    expect(Homepage.args?.headline).toBe(
      ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline
    );
    expect(Homepage.args?.duo).toBe(ARTIST_PROFILE_COPY.outcomeDuo);
  });
});
