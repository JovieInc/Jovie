import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_PROFILE_SPEC_WALL_VARIANT,
  ArtistProfileSpecWall,
} from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import { getMarketingSection, resolveComposition } from '@/data/marketing';

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

  it('registers and renders the exact five-tile production visual body', () => {
    const section = getMarketingSection('spec-wall');

    expect(ARTIST_NOTIFICATIONS_SPEC_TILES).toHaveLength(5);
    expect(
      ARTIST_NOTIFICATIONS_SPEC_TILES.every(
        tile =>
          tile.visual === 'screenshot' &&
          Boolean(tile.screenshotSrc) &&
          Boolean(tile.screenshotAlt)
      )
    ).toBe(true);
    expect(section.component).toBe(
      'components/marketing/artist-profile/ArtistProfileSpecWall'
    );
    expect(section.defaultVariant).toBe(ARTIST_PROFILE_SPEC_WALL_VARIANT);
    expect(section.variants).toEqual([
      expect.objectContaining({
        id: ARTIST_PROFILE_SPEC_WALL_VARIANT,
        media: 'screenshot',
        status: 'active',
        exemplar: {
          route: '/artist-notifications',
          section: 'specWall',
        },
      }),
    ]);

    const composition = resolveComposition({
      businessObjective: 'Bring fans back for new releases and nearby shows.',
      targetAudience: 'general',
      desiredConversion: 'start',
      intent: 'feature',
    });
    expect(
      composition.sections.find(
        candidate => candidate.sectionId === 'spec-wall'
      )?.variantId
    ).toBe(ARTIST_PROFILE_SPEC_WALL_VARIANT);

    render(
      <ArtistProfileSpecWall
        specWall={ARTIST_NOTIFICATIONS_COPY.specWall}
        tiles={ARTIST_NOTIFICATIONS_SPEC_TILES}
      />
    );

    expect(screen.getByTestId('artist-profile-spec-wall-grid')).toHaveAttribute(
      'data-spec-wall-variant',
      ARTIST_PROFILE_SPEC_WALL_VARIANT
    );
    const renderedTiles = screen.getAllByTestId('artist-profile-spec-tile');
    expect(renderedTiles).toHaveLength(5);
    for (const tile of renderedTiles) {
      expect(tile).toHaveAttribute('data-spec-wall-tile-media', 'screenshot');
    }
    for (const tile of ARTIST_NOTIFICATIONS_SPEC_TILES) {
      if (tile.visual !== 'screenshot') {
        throw new Error(`expected screenshot tile: ${tile.id}`);
      }
      expect(screen.getByAltText(tile.screenshotAlt)).toBeInTheDocument();
    }
  });

  it('binds the section story to the registered route fixture and variant', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/storybook/MarketingSections.stories.tsx'
      ),
      'utf8'
    );
    const storySource = source.slice(
      source.indexOf('export const specWall'),
      source.indexOf('export const capture')
    );

    expect(storySource).toContain(
      'variantId={ARTIST_PROFILE_SPEC_WALL_VARIANT}'
    );
    expect(storySource).toContain('<ArtistProfileSpecWall');
    expect(storySource).toContain(
      'specWall={ARTIST_NOTIFICATIONS_COPY.specWall}'
    );
    expect(storySource).toContain('tiles={ARTIST_NOTIFICATIONS_SPEC_TILES}');
    expect(storySource).not.toContain('ARTIST_PROFILE_TRUTH_TILES');
  });
});
