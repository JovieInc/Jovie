import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FRAMER_KIT_ACCENTS,
  FRAMER_KIT_COPY,
  FRAMER_KIT_SHOWCASE_TILES,
  FRAMER_KIT_SPEC_TILES,
} from '@/data/framerKitCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  MarketingPlatformSpecBento,
  MarketingShippedSitesShowcase,
} from './MarketingFramerKit';

const webRoot = path.resolve(__dirname, '../../..');

describe('MarketingShippedSitesShowcase', () => {
  it('renders real shipped artist and release tiles, not lorem', () => {
    render(<MarketingShippedSitesShowcase />);

    expect(
      screen.getByRole('heading', {
        name: FRAMER_KIT_COPY.showcase.headline,
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('framer-kit-showcase')).toBeInTheDocument();

    const tiles = screen.getAllByTestId('framer-kit-showcase-tile');
    expect(tiles).toHaveLength(FRAMER_KIT_SHOWCASE_TILES.length);

    expect(
      screen.getAllByRole('link', { name: /Tim White/i }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: /Tim White/i })[0]
    ).toHaveAttribute('href', TIM_WHITE_PROFILE.publicProfilePath);

    expect(screen.getByText('The Deep End')).toBeInTheDocument();
    expect(screen.queryByText(/lorem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Get started/i)).not.toBeInTheDocument();
  });
});

describe('MarketingPlatformSpecBento', () => {
  it('renders a screenshot-backed platform bento with Jovie accents only', () => {
    render(<MarketingPlatformSpecBento />);

    expect(screen.getByTestId('framer-kit-spec-bento')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: FRAMER_KIT_COPY.specBento.headline,
      })
    ).toBeInTheDocument();

    const tiles = screen.getAllByRole('article');
    expect(tiles).toHaveLength(FRAMER_KIT_SPEC_TILES.length);
    expect(FRAMER_KIT_SPEC_TILES.map(tile => tile.title)).toEqual([
      'Release Workspace',
      'Audience Cities',
      'Tracked Links',
      'Live Sync',
      'Fan Capture',
    ]);

    for (const tile of FRAMER_KIT_SPEC_TILES) {
      expect(FRAMER_KIT_ACCENTS).toContain(tile.accent);
      expect(tile.visual).toBe('screenshot');
    }

    expect(screen.queryByText(/Get started/i)).not.toBeInTheDocument();
  });
});

describe('Framer kit source contract', () => {
  it('locks accents to blue / pink / purple and mounts on both surfaces', () => {
    const kitSource = readFileSync(
      path.join(
        webRoot,
        'components/marketing/framer-kit/MarketingFramerKit.tsx'
      ),
      'utf8'
    );
    const dataSource = readFileSync(
      path.join(webRoot, 'data/framerKitCopy.ts'),
      'utf8'
    );
    const cssSource = readFileSync(
      path.join(
        webRoot,
        'components/marketing/framer-kit/MarketingFramerKit.css'
      ),
      'utf8'
    );
    const homeSource = readFileSync(
      path.join(webRoot, 'app/(home)/page.tsx'),
      'utf8'
    );
    const artistSource = readFileSync(
      path.join(
        webRoot,
        'components/marketing/artist-profile/ArtistProfileLandingPage.tsx'
      ),
      'utf8'
    );

    for (const source of [kitSource, dataSource, cssSource]) {
      expect(source).not.toMatch(/accent-green|geist-green|emerald|bg-green/);
      expect(source).not.toMatch(/accent-teal|geist-teal/);
    }

    expect(homeSource).toContain('<MarketingShippedSitesShowcase');
    expect(homeSource).toContain('<MarketingPlatformSpecBento');
    expect(artistSource).toContain('<MarketingShippedSitesShowcase');
    expect(artistSource).toContain('<MarketingPlatformSpecBento');
  });
});
