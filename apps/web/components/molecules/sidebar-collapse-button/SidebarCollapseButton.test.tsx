import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@jovie/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@jovie/ui')>()),
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

const sidebar = vi.hoisted(() => ({ isPreview: false }));
vi.mock('@/components/shell/SidebarContext', () => ({
  useSidebar: () => ({
    toggleSidebar: vi.fn(),
    state: 'open' as const,
    isPreview: sidebar.isPreview,
    open: !sidebar.isPreview,
  }),
}));

import { SidebarCollapseButton } from './SidebarCollapseButton';

describe('SidebarCollapseButton', () => {
  it('routes the shell control through the canonical icon-button contract (JOV-3959)', async () => {
    // The shell renders the rail this control names in aria-controls.
    const { container } = render(
      <>
        <nav id='shell-left-rail' aria-label='Sidebar' />
        <SidebarCollapseButton />
      </>
    );

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
    await expectNoA11yViolations(container);
  });

  it('offers Pin sidebar during a flyout peek and can opt out of peek triggers', () => {
    sidebar.isPreview = true;
    render(<SidebarCollapseButton previewTrigger={false} />);
    const button = screen.getByRole('button', { name: 'Pin sidebar' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('data-rail-preview-trigger', 'false');
    sidebar.isPreview = false;
  });
});
