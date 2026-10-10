import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@jovie/ui')>()),
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

vi.mock('@/components/shell/SidebarContext', () => ({
  useSidebar: () => ({
    toggleSidebar: vi.fn(),
    state: 'open' as const,
  }),
}));

import { SidebarCollapseButton } from './SidebarCollapseButton';

describe('SidebarCollapseButton', () => {
  it('routes the shell control through the canonical icon-button contract (JOV-3959)', () => {
    render(<SidebarCollapseButton />);

    const button = screen.getByRole('button', { name: /collapse sidebar/i });

    expect(button).toHaveClass(
      'bg-transparent',
      'rounded-full',
      'h-7',
      'w-7',
      'before:h-11',
      'before:w-11'
    );
    expect(button.className).not.toContain('aria-pressed:bg-');
    expect(button).toHaveAttribute('data-rail-toggle', 'left');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.className).not.toMatch(/\bborder-(?:default|subtle|\[)/);
    expect(button.className).not.toContain('rounded-md');
    expect(button.className).not.toContain('hover:border-default');
  });
});
