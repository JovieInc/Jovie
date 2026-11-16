import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileSpecWall } from './ArtistProfileSpecWall';

describe('ArtistProfileSpecWall', () => {
  it('renders the numbered truth wall when truth tiles are supplied', async () => {
    const { container } = render(
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
    const tiles = screen.getAllByTestId('artist-profile-truth-tile');
    expect(tiles).toHaveLength(ARTIST_PROFILE_TRUTH_TILES.length);
    expect(tiles[0]).toHaveTextContent('01');
    expect(
      within(tiles[0]).getByRole('heading', {
        name: ARTIST_PROFILE_TRUTH_TILES[0].title,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the feature bento with one article per tile', async () => {
    const { container } = render(
      <ArtistProfileSpecWall
        specWall={ARTIST_NOTIFICATIONS_COPY.specWall}
        tiles={ARTIST_NOTIFICATIONS_SPEC_TILES}
        sectionId='spec-wall'
        sectionVariant='bento'
        sectionOwner='owner.tsx'
      />
    );

    expect(screen.getAllByRole('article')).toHaveLength(
      ARTIST_NOTIFICATIONS_SPEC_TILES.length
    );
    for (const tile of ARTIST_NOTIFICATIONS_SPEC_TILES)
      expect(
        screen.getByRole('heading', { name: tile.title })
      ).toBeInTheDocument();
    expect(screen.getByTestId('marketing-section-spec-wall')).toHaveAttribute(
      'data-marketing-variant',
      'bento'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps only the header when no tiles are supplied', async () => {
    const { container } = render(
      <ArtistProfileSpecWall specWall={ARTIST_PROFILE_COPY.specWall} />
    );

    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(
      screen.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.specWall.headline,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a partial Arabic truth wall right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileSpecWall
          specWall={{
            ...ARTIST_PROFILE_COPY.specWall,
            headline: 'موسيقاك تبقى معاً.',
          }}
          truthTiles={ARTIST_PROFILE_TRUTH_TILES.slice(0, 2)}
        />
      </div>
    );

    expect(screen.getAllByTestId('artist-profile-truth-tile')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
