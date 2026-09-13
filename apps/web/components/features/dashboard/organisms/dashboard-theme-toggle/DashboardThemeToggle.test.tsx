import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const { handleThemeChange } = vi.hoisted(() => ({
  handleThemeChange: vi.fn(),
}));

vi.mock('./useDashboardTheme', () => ({
  useDashboardTheme: () => ({
    mounted: true,
    isUpdating: false,
    theme: 'light',
    resolvedTheme: 'light',
    isDark: false,
    handleThemeChange,
  }),
}));

describe('DashboardThemeToggle', () => {
  beforeEach(() => {
    handleThemeChange.mockReset();
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
});
