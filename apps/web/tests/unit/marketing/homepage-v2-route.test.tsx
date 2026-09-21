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
