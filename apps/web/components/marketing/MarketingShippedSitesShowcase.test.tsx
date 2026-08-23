import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SHIPPED_SITE_TILES,
  SHIPPED_SITES_SHOWCASE_COPY,
} from '@/data/marketingShowcaseSpecCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { MarketingShippedSitesShowcase } from './MarketingShippedSitesShowcase';

const KIT_SOURCE_FILES = [
  'MarketingShippedSitesShowcase.tsx',
  'MarketingShippedSitesShowcase.css',
  'MarketingPlatformSpecBento.tsx',
  'MarketingPlatformSpecBento.css',
  '../../data/marketingShowcaseSpecCopy.ts',
] as const;

describe('MarketingShippedSitesShowcase', () => {
  it('renders live shipped artist tiles, not placeholder copy', () => {
    render(<MarketingShippedSitesShowcase />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: SHIPPED_SITES_SHOWCASE_COPY.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketing-shipped-sites-showcase')
    ).toBeInTheDocument();

    const tiles = screen.getAllByTestId('shipped-site-tile');
    expect(tiles).toHaveLength(SHIPPED_SITE_TILES.length);
    expect(tiles.length).toBeGreaterThanOrEqual(6);

    const linkedTiles = tiles.filter(tile => tile.tagName === 'A');
    expect(linkedTiles.length).toBeGreaterThan(0);
    for (const tile of linkedTiles) {
      expect(tile).toHaveAttribute('href', TIM_WHITE_PROFILE.publicProfilePath);
    }

    expect(screen.getAllByText(TIM_WHITE_PROFILE.name).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('Latest Release')).toBeInTheDocument();
    expect(screen.getByText('Desktop Site')).toBeInTheDocument();
    expect(screen.getByText('The Deep End')).toBeInTheDocument();
    expect(screen.queryByText(/lorem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/john doe/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Get started/i })
    ).not.toBeInTheDocument();
  });

  it('is mounted on the homepage and artist profiles landing', () => {
    const repoRoot = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../../..'
    );
    const homePage = readFileSync(
      path.join(repoRoot, 'apps/web/app/(home)/page.tsx'),
      'utf8'
    );
    const artistProfiles = readFileSync(
      path.join(
        repoRoot,
        'apps/web/components/marketing/artist-profile/ArtistProfileLandingPage.tsx'
      ),
      'utf8'
    );

    expect(homePage).toContain('MarketingShippedSitesShowcase');
    expect(homePage).toContain('MarketingPlatformSpecBento');
    expect(artistProfiles).toContain('MarketingShippedSitesShowcase');
    expect(artistProfiles).toContain('MarketingPlatformSpecBento');
  });

  it('keeps the shipped kit on Jovie accents and off default green', () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);

    for (const file of KIT_SOURCE_FILES) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source, `${file} used a default success hue`).not.toMatch(
        /accent-green|text-green|bg-green|emerald|teal|mint/i
      );
    }
  });
});
