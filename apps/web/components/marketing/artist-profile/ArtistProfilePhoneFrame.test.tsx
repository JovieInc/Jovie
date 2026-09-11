import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageUnscaledNotchRedFixture } from '../../../tests/unit/home/homepage-optical-polish-red-fixtures';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

const css = readFileSync(
  path.resolve(__dirname, 'ArtistProfilePhoneFrame.css'),
  'utf8'
);
const source = readFileSync(
  path.resolve(__dirname, 'ArtistProfilePhoneFrame.tsx'),
  'utf8'
);

const LG_WIDTH_PX = 21.25 * 16;
const TRIO_MOBILE_WIDTH_PX = 7.5 * 16;
const FIXED_NOTCH_WIDTH_PX = 7 * 16;

describe('ArtistProfilePhoneFrame size-derived chrome (homepage-optical-polish-v1 item 2)', () => {
  it('exposes size variants and keeps notch classes free of fixed Tailwind chrome', () => {
    const { container, rerender } = render(
      <ArtistProfilePhoneFrame>
        <img alt='' />
      </ArtistProfilePhoneFrame>
    );
    const frame = container.querySelector('.ap-phone-frame');
    expect(frame).toHaveAttribute('data-size', 'lg');

    rerender(
      <ArtistProfilePhoneFrame size='sm'>
        <img alt='' />
      </ArtistProfilePhoneFrame>
    );
    expect(container.querySelector('.ap-phone-frame')).toHaveAttribute(
      'data-size',
      'sm'
    );

    const notch = container.querySelector('.ap-phone-frame__notch');
    expect(notch?.className).not.toMatch(/\bw-28\b/);
    expect(notch?.className).not.toMatch(/\bh-6\b/);
    expect(notch?.className).not.toMatch(/\btop-3\b/);
    expect(source).not.toMatch(/\bw-28\b/);
    expect(source).not.toMatch(/\bp-3\b/);
  });

  it('derives bezel, radius, notch, and offsets from the size scale and cqi', () => {
    expect(css).toContain('--ap-phone-scale');
    expect(css).toContain('--ap-phone-radius');
    expect(css).toContain('--ap-phone-screen-radius');
    expect(css).toContain('--ap-phone-notch-width');
    expect(css).toContain('--ap-phone-notch-height');
    expect(css).toContain('--ap-phone-notch-inset');
    expect(css).toContain('32.94cqi');
    expect(css).toContain('8.71cqi');
    expect(css).toContain('[data-size="sm"]');
    expect(css).toContain('[data-size="md"]');
    expect(css).not.toMatch(
      /\.ap-phone-frame__notch[^{]*\{[^}]*\bwidth:\s*7rem/
    );
  });

  it('rejects the unscaled-notch deliberate-red fixture that would overwhelm 7.5rem', () => {
    const { container } = render(<HomepageUnscaledNotchRedFixture />);
    const fixture = container.firstElementChild;
    const notch = container.querySelector('.ap-phone-frame__notch');

    expect(fixture).toHaveAttribute(
      'data-deliberate-red',
      'homepage-unscaled-notch'
    );
    expect(notch?.className).toMatch(/\bw-28\b/);

    const unscaledRatio = FIXED_NOTCH_WIDTH_PX / TRIO_MOBILE_WIDTH_PX;
    const scaledRatio = 0.3294;
    const lgRatio = FIXED_NOTCH_WIDTH_PX / LG_WIDTH_PX;

    expect(unscaledRatio).toBeGreaterThan(0.9);
    expect(scaledRatio).toBeCloseTo(lgRatio, 2);
    expect(scaledRatio).toBeLessThan(0.4);
    expect(source).not.toMatch(/\bw-28\b/);
    expect(css).toContain('min(var(--ap-phone-notch-width), 32.94cqi)');
  });
});
