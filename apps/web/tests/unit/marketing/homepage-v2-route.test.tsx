import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageV2Route } from '@/components/marketing/homepage-v2/HomepageV2Route';

describe('HomepageV2Route hero demo', () => {
  it('keeps the scaled profile preview inert for the host accessibility tree', () => {
    const { container } = render(<HomepageV2Route />);

    const demo = container.querySelector('.homepage-v2-hero__demo-scale');
    expect(demo).toHaveAttribute('aria-hidden', 'true');
    expect(demo).toHaveAttribute('inert');
  });
});

describe('HomepageV2Route sections', () => {
  it('always mounts the power grid and social proof sections', () => {
    const { container } = render(<HomepageV2Route />);

    expect(
      container.querySelector('[data-testid="homepage-v2-power-grid"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="homepage-v2-social-proof"]')
    ).not.toBeNull();
  });
});
