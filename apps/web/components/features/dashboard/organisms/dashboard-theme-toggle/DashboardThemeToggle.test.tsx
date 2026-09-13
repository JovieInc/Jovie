import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const { dashboardThemeState, handleThemeChange } = vi.hoisted(() => ({
  handleThemeChange: vi.fn(),
  dashboardThemeState: {
    mounted: true,
    isUpdating: false,
    theme: 'light',
    resolvedTheme: 'light',
    isDark: false,
  },
}));

vi.mock('./useDashboardTheme', () => ({
  useDashboardTheme: () => ({
    ...dashboardThemeState,
    handleThemeChange,
  }),
}));

describe('DashboardThemeToggle', () => {
  beforeEach(() => {
    handleThemeChange.mockReset();
    dashboardThemeState.isUpdating = false;
    dashboardThemeState.isDark = false;
    dashboardThemeState.theme = 'light';
    dashboardThemeState.resolvedTheme = 'light';
  });

  it('uses the canonical Switch owner for the default theme control', () => {
    render(
      <TooltipProvider>
        <DashboardThemeToggle />
      </TooltipProvider>
    );

    const toggle = screen.getByRole('switch', { name: 'Switch to dark mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('h-6', 'w-11');

    fireEvent.click(toggle);

    expect(handleThemeChange).toHaveBeenCalledWith('dark');
  });

  it('exposes the in-flight update as a disabled control', () => {
    dashboardThemeState.isUpdating = true;

    render(
      <TooltipProvider>
        <DashboardThemeToggle />
      </TooltipProvider>
    );

    const toggle = screen.getByRole('switch', { name: 'Updating theme...' });
    expect(toggle).toBeDisabled();

    fireEvent.click(toggle);

    expect(handleThemeChange).not.toHaveBeenCalled();
  });
});
