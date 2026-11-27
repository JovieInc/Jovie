import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ScreenshotFilterBar } from './ScreenshotFilterBar';

function renderBar(
  overrides: Partial<Parameters<typeof ScreenshotFilterBar>[0]> = {}
) {
  const handlers = {
    onSurfaceChange: vi.fn(),
    onGroupChange: vi.fn(),
    onConsumerChange: vi.fn(),
  };
  const view = render(
    <ScreenshotFilterBar
      shown={2}
      total={5}
      canonical={3}
      other={2}
      surfaceFilter='all'
      groupFilter='all'
      consumerFilter='all'
      {...handlers}
      {...overrides}
    />
  );
  return { ...view, ...handlers };
}

describe('ScreenshotFilterBar', () => {
  it('reports counts and fires each filter handler', async () => {
    const user = userEvent.setup();
    const { container, onSurfaceChange, onGroupChange, onConsumerChange } =
      renderBar();

    expect(
      screen.getByText('Showing 2 of 5 captures. Canonical: 3. Other: 2.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Other Captures' }));
    expect(onSurfaceChange).toHaveBeenCalledWith('other');

    await user.click(screen.getByText('More Filters'));
    await user.click(screen.getByRole('button', { name: 'Marketing' }));
    expect(onGroupChange).toHaveBeenCalledWith('marketing');
    await user.click(screen.getByRole('button', { name: 'Investor Ready' }));
    expect(onConsumerChange).toHaveBeenCalledWith('investor-ready');
    await expectNoA11yViolations(container);
  });

  it('marks only the active pill as pressed', () => {
    renderBar({ surfaceFilter: 'other' });

    expect(
      screen.getByRole('button', { name: 'Other Captures' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'All Captures' })
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
