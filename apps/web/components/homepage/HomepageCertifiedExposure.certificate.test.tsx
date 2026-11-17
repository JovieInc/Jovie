import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { page, track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';

vi.mock('@/lib/analytics', () => ({ page: vi.fn(), track: vi.fn() }));

describe('HomepageCertifiedExposure certificate', () => {
  beforeEach(() => {
    vi.mocked(page).mockClear();
    vi.mocked(track).mockClear();
  });

  it('adds nothing to the page and leaves the surrounding page axe-clean', async () => {
    const { container } = render(
      <main>
        <h1>Control how the world sees you.</h1>
        <HomepageCertifiedExposure />
      </main>
    );

    expect(container.querySelector('main')?.childElementCount).toBe(1);
    await expectNoA11yViolations(container);
  });

  it('records one page view and two exposures on mount, none on re-render', () => {
    const { rerender } = render(<HomepageCertifiedExposure />);
    rerender(<HomepageCertifiedExposure />);

    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith('home', HOMEPAGE_CERTIFIED_CONTEXT);
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenNthCalledWith(
      1,
      HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(track).toHaveBeenNthCalledWith(
      2,
      HOMEPAGE_CERTIFIED_EVENTS.SEARCH_EXPOSED,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
  });
});
