import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NormalizedLogoAsset } from './NormalizedLogoAsset';
import { getTrustLogoAsset } from './trustLogoAssets';

describe('NormalizedLogoAsset', () => {
  it('switches the real UMG canvas from natural pixels to containment and back without replacing its art', () => {
    const { normalization, component: Logo, label } = getTrustLogoAsset('umg');
    const { container, rerender } = render(
      <NormalizedLogoAsset asset={normalization}>
        <Logo aria-label={label} />
      </NormalizedLogoAsset>
    );
    const frame = container.querySelector<HTMLElement>(
      '[data-logo-asset="umg"]'
    )!;
    const originalArt = frame.querySelector('svg')!.outerHTML;
    expect(frame.style.aspectRatio).toBe('');
    expect(frame.style.getPropertyValue('--logo-render-width')).toMatch(/px$/);
    expect(frame).not.toHaveClass('max-w-full');

    rerender(
      <NormalizedLogoAsset
        asset={normalization}
        fit='contain'
        className='align-middle'
      >
        <Logo aria-label={label} />
      </NormalizedLogoAsset>
    );
    expect(frame).toHaveClass(
      'h-auto',
      'max-w-full',
      'align-middle',
      'overflow-visible'
    );
    expect(frame.style.aspectRatio).toBe('var(--logo-frame-aspect)');
    expect(frame.style.getPropertyValue('--logo-render-width')).toBe('100%');
    expect(frame.style.getPropertyValue('--logo-render-height')).toMatch(/%$/);
    expect(frame.style.getPropertyValue('--logo-offset-y')).toMatch(/%$/);
    expect(
      Number.parseFloat(frame.style.getPropertyValue('--logo-offset-y'))
    ).toBeLessThan(0);
    expect(frame.style.getPropertyValue('--logo-frame-aspect')).not.toBe('');
    expect(frame.querySelector('svg')!.outerHTML).toBe(originalArt);
    rerender(
      <NormalizedLogoAsset asset={normalization}>
        <Logo aria-label={label} />
      </NormalizedLogoAsset>
    );
    expect(frame.style.aspectRatio).toBe('');
    expect(frame.style.getPropertyValue('--logo-render-width')).toMatch(/px$/);
    expect(frame.querySelector('svg')!.outerHTML).toBe(originalArt);
    // Actual ink containment at narrow widths is measured by homepage.spec.ts;
    // JSDOM only verifies the component selects the responsive canvas contract.
  });
});
