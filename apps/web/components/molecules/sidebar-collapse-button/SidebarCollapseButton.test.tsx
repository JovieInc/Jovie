import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
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
  it('renders a borderless circular System B icon control (JOV-3959)', () => {
    render(<SidebarCollapseButton />);

    const button = screen.getByRole('button', { name: /collapse sidebar/i });

    expect(button).toHaveClass('rounded-full', 'border-0', 'bg-transparent');
    expect(button).toHaveClass('hover:bg-surface-0');
    // No decorative border token classes (border-0 is the only border utility).
    expect(button.className).not.toMatch(/\bborder-(?:default|subtle|\[)/);
    expect(button.className).not.toContain('rounded-md');
    expect(button.className).not.toContain('hover:border-default');
  });
});
