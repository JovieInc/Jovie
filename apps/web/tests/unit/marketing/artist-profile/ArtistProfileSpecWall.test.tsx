import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SPEC_TILES } from '@/data/artistProfileFeatures';

describe('ArtistProfileSpecWall', () => {
  it('renders the compact seven-tile spec wall without legacy slop copy', () => {
    render(
      <ArtistProfileSpecWall
        specWall={ARTIST_PROFILE_COPY.specWall}
        tiles={ARTIST_PROFILE_SPEC_TILES}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'Details that pull their weight.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Built from 15 years of music marketing experience, obsessing over the details that make a profile convert.'
      )
    ).toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 3 });
    const titles = headings.map(heading => heading.textContent);

    expect(titles).toEqual([
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

    const richAnalyticsCard = screen
      .getByRole('heading', { name: 'Rich Analytics' })
      .closest('article');

    expect(richAnalyticsCard).not.toBeNull();

    if (richAnalyticsCard) {
      expect(
        within(richAnalyticsCard).getByRole('img', {
          name: 'Rich analytics funnel preview',
        })
      ).toBeInTheDocument();
    }

    expect(screen.queryByText('Power features')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Audience quality filtering')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Opinionated design')).not.toBeInTheDocument();
    expect(screen.queryByText('Product philosophy')).not.toBeInTheDocument();
  });
});
