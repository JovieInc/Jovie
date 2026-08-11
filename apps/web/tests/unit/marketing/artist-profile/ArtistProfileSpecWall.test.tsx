import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';

describe('ArtistProfileSpecWall', () => {
  it('renders the shipped /artist-notifications five-screenshot-tile bento (5-screenshot-bento)', () => {
    render(
      <ArtistProfileSpecWall
        specWall={ARTIST_NOTIFICATIONS_COPY.specWall}
        tiles={ARTIST_NOTIFICATIONS_SPEC_TILES}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: ARTIST_NOTIFICATIONS_COPY.specWall.headline,
      })
    ).toBeInTheDocument();

    const tiles = screen.getAllByRole('article');
    expect(tiles).toHaveLength(5);

    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map(heading => heading.textContent);
    expect(titles).toEqual(ARTIST_NOTIFICATIONS_SPEC_TILES.map(t => t.title));

    // The production variant carries a visual per tile — no pure-text truth tiles.
    expect(screen.queryAllByTestId('artist-profile-truth-tile')).toHaveLength(
      0
    );
  });

  it('renders the compact ten-tile product truth wall without legacy slop copy', () => {
    render(
      <ArtistProfileSpecWall
        specWall={ARTIST_PROFILE_COPY.specWall}
        truthTiles={ARTIST_PROFILE_TRUTH_TILES}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.specWall.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(ARTIST_PROFILE_COPY.specWall.subhead)
    ).toBeInTheDocument();

    expect(screen.getAllByTestId('artist-profile-truth-tile')).toHaveLength(10);

    const headings = screen.getAllByRole('heading', { level: 3 });
    const titles = headings.map(heading => heading.textContent);

    expect(titles).toEqual(ARTIST_PROFILE_TRUTH_TILES.map(tile => tile.title));

    expect(screen.queryByText('Details that matter.')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Built from 15 years of music marketing experience, obsessing over the details that make a profile convert.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Audience Quality Filtering')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Power features')).not.toBeInTheDocument();
    expect(screen.queryByText('Opinionated design')).not.toBeInTheDocument();
    expect(screen.queryByText('Product philosophy')).not.toBeInTheDocument();
  });
});
