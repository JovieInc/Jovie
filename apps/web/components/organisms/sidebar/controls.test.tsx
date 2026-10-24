import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./context', () => ({
  useSidebar: () => ({
    state: 'open',
    open: true,
    setOpen: vi.fn(),
    openMobile: false,
    setOpenMobile: vi.fn(),
    isMobile: false,
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.ComponentProps<'button'> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
  Kbd: ({ children }: { readonly children: React.ReactNode }) => (
    <kbd>{children}</kbd>
  ),
}));

import { SidebarRail, SidebarShortcutHint, SidebarTrigger } from './controls';

describe('sidebar controls', () => {
  it('renders SidebarTrigger with accessible label', () => {
    render(<SidebarTrigger />);
    expect(screen.getByText('Toggle sidebar')).toBeTruthy();
  });

  it('renders shortcut hint', () => {
    render(<SidebarShortcutHint />);
    expect(screen.getByText(/.+/)).toBeTruthy();
  });

  it('renders SidebarRail toggle control', () => {
    render(<SidebarRail />);
    expect(screen.getByLabelText('Toggle sidebar')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});
