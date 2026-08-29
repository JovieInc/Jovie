import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    pressFeedback: _pressFeedback,
    static: _static,
    ...props
  }: React.ComponentProps<'button'> & {
    readonly pressFeedback?: boolean;
    readonly static?: boolean;
  }) => <button {...props}>{children}</button>,
  IconButton: ({
    children,
    variant,
    size,
    ...props
  }: React.ComponentProps<'button'> & {
    readonly variant?: string;
    readonly size?: string;
  }) => (
    <button
      data-icon-button-variant={variant}
      data-icon-button-size={size}
      {...props}
    >
      {children}
    </button>
  ),
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

vi.mock('@/components/organisms/Sidebar', () => ({
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

    expect(button).toHaveAttribute('data-icon-button-variant', 'secondary');
    expect(button).toHaveAttribute('data-icon-button-size', 'sm');
    expect(button).toHaveAttribute('data-rail-toggle', 'left');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.className).not.toMatch(/\bborder-(?:default|subtle|\[)/);
    expect(button.className).not.toContain('rounded-md');
    expect(button.className).not.toContain('hover:border-default');
  });
});
