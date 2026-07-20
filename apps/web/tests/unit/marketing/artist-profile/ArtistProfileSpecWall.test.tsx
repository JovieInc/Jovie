import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SPEC_TILES } from '@/data/artistProfileFeatures';

describe('ArtistProfileSpecWall', () => {
  it('renders the compact eight-tile spec wall without legacy slop copy', () => {
    render(
      <ArtistProfileSpecWall
        specWall={ARTIST_PROFILE_COPY.specWall}
        tiles={ARTIST_PROFILE_SPEC_TILES}
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

    const headings = screen.getAllByRole('heading', { level: 3 });
    const titles = headings.map(heading => heading.textContent);

    expect(titles).toEqual([
      'Audience Quality Filtering',
      'Rich Analytics',
      'Geo Insights',
      'Always in Sync',
      'Activate Creators',
      'Press-Ready Assets',
      'UTM Builder',
      'Blazing Fast',
    ]);

    for (const title of titles) {
      const card = screen
        .getByRole('heading', { name: title ?? '' })
        .closest('article');
      expect(card).not.toBeNull();

      if (!card) {
        continue;
      }

      expect(within(card).getByRole('img')).toBeInTheDocument();
    }

    const audienceQualityCard = screen
      .getByRole('heading', { name: 'Audience Quality Filtering' })
      .closest('article');

    expect(audienceQualityCard).not.toBeNull();

    if (audienceQualityCard) {
      expect(
        within(audienceQualityCard).getByRole('img', {
          name: 'Audience Quality Filtering Preview',
        })
      ).toBeInTheDocument();
      expect(
        within(audienceQualityCard).getByText('Actual Fans')
      ).toBeInTheDocument();
    }

    expect(screen.queryByText('Power features')).not.toBeInTheDocument();
    expect(screen.queryByText('Opinionated design')).not.toBeInTheDocument();
    expect(screen.queryByText('Product philosophy')).not.toBeInTheDocument();
  });
});
