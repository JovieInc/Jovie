import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const { handleThemeChange, state } = vi.hoisted(() => ({
  handleThemeChange: vi.fn(),
  state: {
    mounted: true,
    isUpdating: false,
    theme: 'system',
    resolvedTheme: 'dark',
    isDark: true,
  },
}));

vi.mock('./useDashboardTheme', () => ({
  useDashboardTheme: () => ({ ...state, handleThemeChange }),
}));

describe('DashboardThemeToggle certificate', () => {
  it('keeps the three-way grid axe-clean and picks a theme by click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TooltipProvider>
        <DashboardThemeToggle showSystemOption />
      </TooltipProvider>
    );

    expect(screen.getByText('(dark)')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: /Light/ }));
    expect(handleThemeChange).toHaveBeenCalledWith('light');
  });

  it('keeps the compact toggle axe-clean', async () => {
    const { container } = render(
      <TooltipProvider>
        <DashboardThemeToggle variant='compact' />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: 'Switch to light mode' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
