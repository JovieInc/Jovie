import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NormalizedTrustLogo } from './NormalizedTrustLogo';
import { getTrustLogoAsset } from './trustLogoAssets';

describe('NormalizedTrustLogo', () => {
  it.each([
    'umg',
    'armada',
  ] as const)('contains the complete original %s artwork and retains its accessible identity', id => {
    const { component: Logo, label } = getTrustLogoAsset(id);
    const original = render(<Logo aria-label={label} />);
    const originalArt = original.container.querySelector('svg')!.outerHTML;
    original.unmount();

    const { container } = render(
      <NormalizedTrustLogo id={id} className='align-middle' />
    );
    const frame = container.querySelector<HTMLElement>(
      `[data-logo-asset="${id}"]`
    )!;
    expect(frame).toHaveClass(
      'max-w-full',
      'h-auto',
      'overflow-visible',
      'align-middle'
    );
    expect(frame.style.getPropertyValue('--logo-render-width')).toMatch(/%$/);
    expect(frame.style.getPropertyValue('--logo-render-height')).toMatch(/%$/);
    const svg = frame.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-label', label);
    expect(svg.outerHTML).toBe(originalArt);
  });

  it('replaces both identity and normalization when the selected logo changes', () => {
    const { container, rerender } = render(<NormalizedTrustLogo id='umg' />);
    const previousAspect = container
      .querySelector<HTMLElement>('span')!
      .style.getPropertyValue('--logo-frame-aspect');
    rerender(<NormalizedTrustLogo id='armada' />);
    expect(container.querySelector('[data-logo-asset="umg"]')).toBeNull();
    const frame = container.querySelector<HTMLElement>(
      '[data-logo-asset="armada"]'
    )!;
    expect(frame.querySelector('svg')).toHaveAttribute(
      'aria-label',
      'Armada Music'
    );
    expect(frame.style.getPropertyValue('--logo-frame-aspect')).not.toBe(
      previousAspect
    );
    expect(frame.style.getPropertyValue('--logo-render-width')).toMatch(/%$/);
  });
});
