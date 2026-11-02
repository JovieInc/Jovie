import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_SPEC_BENTO_COPY,
  PLATFORM_SPEC_TILES,
} from '@/data/marketingShowcaseSpecCopy';
import { getProductShot } from '@/lib/screenshots/product-shots';
import { MarketingPlatformSpecBento } from './MarketingPlatformSpecBento';

describe('MarketingPlatformSpecBento', () => {
  it('renders the dark platform spec bento with Jovie accents only', () => {
    render(<MarketingPlatformSpecBento />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: PLATFORM_SPEC_BENTO_COPY.headline,
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('marketing-section-spec-wall')).toHaveAttribute(
      'data-marketing-variant',
      '5-screenshot-bento'
    );

    expect(
      screen.queryByText(/Dark product surfaces, Jovie accents only/i)
    ).toBeNull();
    expect(
      screen.getByText('Preserved product demonstrations · illustrative data')
    ).toBeVisible();
    // The adaptive tile is a registry product shot cropped to identity and
    // the featured release, not a full-viewport desktop capture.
    const adaptive = getProductShot('profile-hero-desktop');
    expect(
      screen.getByRole('img', { name: adaptive.alt }).getAttribute('src')
    ).toBe(adaptive.webp);
    expect(
      screen.queryByRole('img', { name: /demo of Tim White.*desktop/i })
    ).toBeNull();

    const tiles = screen.getAllByTestId('platform-spec-tile');
    expect(tiles).toHaveLength(PLATFORM_SPEC_TILES.length);

    const accents = tiles.map(tile => tile.getAttribute('data-accent'));
    expect(new Set(accents)).toEqual(new Set(['blue', 'pink', 'purple']));
    expect(accents).not.toContain('green');
    expect(accents).not.toContain('teal');

    expect(
      screen.getByRole('heading', { name: 'One Adaptive Profile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Capture every listener' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('img').length).toBe(PLATFORM_SPEC_TILES.length);
  });
});
