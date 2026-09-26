import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_EDITORIAL_BACKGROUND_FOCAL_X,
  MARKETING_EDITORIAL_BACKGROUND_FOCAL_Y,
  MARKETING_EDITORIAL_BACKGROUND_VARIANTS,
  MarketingEditorialBackground,
  type MarketingEditorialBackgroundProps,
} from './MarketingEditorialBackground';

const baseProps = {
  variant: 'soft',
} satisfies MarketingEditorialBackgroundProps;

describe('MarketingEditorialBackground', () => {
  it('renders both registered variants', () => {
    for (const variant of MARKETING_EDITORIAL_BACKGROUND_VARIANTS) {
      const { container, unmount } = render(
        <MarketingEditorialBackground {...baseProps} variant={variant} />
      );
      expect(
        container.querySelector('.marketing-editorial-background')
      ).not.toBeNull();
      const root = screen.getByTestId('marketing-editorial-background');
      expect(root.getAttribute('data-variant')).toBe(variant);
      unmount();
    }
  });

  it('declares the focal location per axis', () => {
    for (const focalX of MARKETING_EDITORIAL_BACKGROUND_FOCAL_X) {
      for (const focalY of MARKETING_EDITORIAL_BACKGROUND_FOCAL_Y) {
        const { unmount } = render(
          <MarketingEditorialBackground
            {...baseProps}
            focalX={focalX}
            focalY={focalY}
          />
        );
        const root = screen.getByTestId('marketing-editorial-background');
        expect(root.getAttribute('data-focal-x')).toBe(focalX);
        expect(root.getAttribute('data-focal-y')).toBe(focalY);
        unmount();
      }
    }
  });

  it('renders the soft field and keeps it subordinate to content', () => {
    const { container } = render(
      <MarketingEditorialBackground {...baseProps} variant='soft' />
    );
    const field = container.querySelector(
      '.marketing-editorial-background__field'
    );
    expect(field).not.toBeNull();
    // The field sits behind content and never intercepts interaction.
    const root = screen.getByTestId('marketing-editorial-background');
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders one dominant flowing sweep with the seam family', () => {
    const { container } = render(
      <MarketingEditorialBackground {...baseProps} variant='flowing' />
    );
    // Exactly one sweep — never a second competing bright center.
    const sweeps = container.querySelectorAll(
      '.marketing-editorial-background__sweep'
    );
    expect(sweeps).toHaveLength(1);
    const seam = container.querySelector(
      '.marketing-editorial-background__seam svg'
    );
    expect(seam).not.toBeNull();
    expect(seam?.getAttribute('viewBox')).toBe('0 0 1200 24');
  });

  it('omits motion by default and only emits bounded motion when enabled', () => {
    const { container: staticContainer } = render(
      <MarketingEditorialBackground {...baseProps} variant='flowing' />
    );
    expect(staticContainer.querySelector('style')).toBeNull();

    const { container: motionContainer } = render(
      <MarketingEditorialBackground {...baseProps} variant='flowing' motion />
    );
    const style = motionContainer.querySelector('style');
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain('@keyframes');
    // Bounded, same-direction sweep only — no loop seam churn.
    expect(style?.textContent).toContain('infinite alternate');
  });

  it('never renders both the soft field and the flowing sweep', () => {
    const { container: soft } = render(
      <MarketingEditorialBackground {...baseProps} variant='soft' />
    );
    expect(
      soft.querySelector('.marketing-editorial-background__sweep')
    ).toBeNull();
    const { container: flowing } = render(
      <MarketingEditorialBackground {...baseProps} variant='flowing' />
    );
    expect(
      flowing.querySelector('.marketing-editorial-background__field')
    ).toBeNull();
  });
});
