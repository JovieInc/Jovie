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
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

import { SidebarCollapseButton } from './SidebarCollapseButton';

describe('SidebarCollapseButton', () => {
  it('renders a borderless circular System B icon control (JOV-3959)', () => {
    render(<SidebarCollapseButton open onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: /collapse sidebar/i });

    expect(button).toHaveClass(
      'h-7',
      'w-7',
      'rounded-full',
      'border-transparent',
      'bg-transparent'
    );
    expect(button).toHaveClass('hover:bg-surface-0');
    expect(button).toHaveAttribute('data-rail-toggle', 'left');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.className).not.toMatch(/\bborder-(?:default|subtle|\[)/);
    expect(button.className).not.toContain('rounded-md');
    expect(button.className).not.toContain('hover:border-default');
  });
});
