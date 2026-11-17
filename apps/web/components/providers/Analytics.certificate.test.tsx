import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({
  pathname: '/pricing' as string | null,
  page: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => <span data-testid='vercel-analytics' hidden />,
}));
vi.mock('@/lib/analytics', () => ({ page: state.page }));

import { Analytics } from './Analytics';

describe('Analytics certificate', () => {
  beforeEach(() => {
    state.pathname = '/pricing';
    state.page.mockReset();
  });

  it('mounts the Vercel beacon, reports the page view and stays axe-clean', async () => {
    const { container, getByTestId, rerender } = render(<Analytics />);

    expect(getByTestId('vercel-analytics')).not.toBeVisible();
    expect(state.page).toHaveBeenCalledWith('/pricing', { url: '/pricing' });

    state.pathname = '/blog';
    rerender(<Analytics />);
    expect(state.page).toHaveBeenLastCalledWith('/blog', { url: '/blog' });
    await expectNoA11yViolations(container);
  });

  it('swallows an analytics failure and still renders the beacon', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new Error('analytics unavailable');
    state.page.mockImplementation(() => {
      throw failure;
    });

    const { container, getByTestId } = render(<Analytics />);

    expect(consoleError).toHaveBeenCalledWith('Analytics error:', failure);
    expect(getByTestId('vercel-analytics')).toBeInTheDocument();
    consoleError.mockRestore();
    await expectNoA11yViolations(container);
  });
});
