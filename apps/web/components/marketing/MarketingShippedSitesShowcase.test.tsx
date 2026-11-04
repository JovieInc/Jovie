import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_STATE_TILES,
  SHIPPED_SITES_SHOWCASE_COPY,
} from '@/data/marketingShowcaseSpecCopy';
import { getScreenshotScenario } from '@/lib/screenshots/registry';
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
  it('shows one profile state per tile with an outcome caption', () => {
    render(<MarketingShippedSitesShowcase />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: SHIPPED_SITES_SHOWCASE_COPY.headline,
      })
    ).toBeInTheDocument();
    const tiles = screen.getAllByTestId('shipped-site-tile');
    // Fewer, bigger tiles: one idea each (Tim, 2026-10-28 critique).
    expect(tiles).toHaveLength(PROFILE_STATE_TILES.length);
    expect(tiles.length).toBeLessThanOrEqual(4);

    for (const tile of PROFILE_STATE_TILES) {
      expect(
        screen.getByRole('heading', { level: 3, name: tile.title })
      ).toBeInTheDocument();
      expect(screen.getByRole('img', { name: tile.alt })).toBeInTheDocument();
    }
    // Captions say the outcome, never the demo identity again.
    expect(
      screen.queryByText(TIM_WHITE_PROFILE.publicProfileDisplay)
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Open the live profile' })
    ).toHaveAttribute('href', TIM_WHITE_PROFILE.publicProfilePath);
  });

  it('uses element captures of the changing component, not full phone shots', () => {
    for (const tile of PROFILE_STATE_TILES) {
      const scenario = getScreenshotScenario(tile.scenarioId);
      expect(scenario?.captureTarget, tile.id).toBe('locator');
      expect(scenario?.consumers, tile.id).toContain('marketing-export');
    }
  });

  it('stays on artist profiles and off the umbrella homepage', () => {
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

    expect(homePage).not.toContain('MarketingShippedSitesShowcase');
    expect(homePage).not.toContain('MarketingPlatformSpecBento');
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
