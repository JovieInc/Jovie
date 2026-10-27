import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@jovie/ui')>()),
  TooltipShortcut: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

const sidebar = vi.hoisted(() => ({
  isPreview: false,
  isMobile: false,
  openMobile: false,
  state: 'open' as 'open' | 'closed',
  toggleSidebar: vi.fn(),
}));
vi.mock('@/components/shell/SidebarContext', () => ({
  useSidebar: () => ({
    toggleSidebar: sidebar.toggleSidebar,
    state: sidebar.state,
    isPreview: sidebar.isPreview,
    open: !sidebar.isPreview,
    isMobile: sidebar.isMobile,
    openMobile: sidebar.openMobile,
  }),
}));

import { SidebarCollapseButton } from './SidebarCollapseButton';

describe('SidebarCollapseButton', () => {
  beforeEach(() => {
    sidebar.isPreview = false;
    sidebar.isMobile = false;
    sidebar.openMobile = false;
    sidebar.state = 'open';
    sidebar.toggleSidebar.mockReset();
  });

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

  it('offers Pin sidebar during a flyout peek and can opt out of peek triggers', () => {
    sidebar.isPreview = true;
    render(<SidebarCollapseButton previewTrigger={false} />);
    const button = screen.getByRole('button', { name: 'Pin sidebar' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('data-rail-preview-trigger', 'false');
  });

  it.each(['open', 'closed'] as const)(
    'closes the mobile drawer independently of the %s desktop rail',
    desktopState => {
      sidebar.isMobile = true;
      sidebar.openMobile = true;
      sidebar.state = desktopState;
      render(<SidebarCollapseButton previewTrigger />);
      const button = screen.getByRole('button', { name: 'Close sidebar' });
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button).toHaveAttribute('aria-controls', 'shell-left-rail');
      expect(button).toHaveAttribute('data-rail-toggle', 'left');
      expect(button).toHaveAttribute('data-rail-preview-trigger', 'false');
      expect(button).not.toHaveAttribute('aria-pressed');
      expect(button).not.toHaveAttribute('data-rail-pinned');
      expect(button).toHaveClass('h-7', 'w-7', 'before:h-11', 'before:w-11');
      expect(screen.getByTestId('sidebar-rail-toggle-icon')).toHaveClass(
        'lucide-x'
      );
      fireEvent.click(button);
      expect(sidebar.toggleSidebar).toHaveBeenCalledOnce();
    }
  );

  it('tracks mobile open state on the same focused control', () => {
    sidebar.isMobile = true;
    const { rerender } = render(<SidebarCollapseButton />);
    const button = screen.getByRole('button', { name: 'Open sidebar' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    button.focus();
    fireEvent.click(button);
    expect(sidebar.toggleSidebar).toHaveBeenCalledOnce();
    sidebar.openMobile = true;
    rerender(<SidebarCollapseButton />);
    expect(screen.getByRole('button', { name: 'Close sidebar' })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
