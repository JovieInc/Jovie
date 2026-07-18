import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';

describe('ArtistProfileSpecWall', () => {
  it('renders the compact ten-tile product truth wall without legacy slop copy', () => {
    render(
      <ArtistProfileSpecWall
        specWall={ARTIST_PROFILE_COPY.specWall}
        truthTiles={ARTIST_PROFILE_TRUTH_TILES}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'Built for artists.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The product truth behind one fast, music-native profile—kept compact on purpose.'
      )
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
