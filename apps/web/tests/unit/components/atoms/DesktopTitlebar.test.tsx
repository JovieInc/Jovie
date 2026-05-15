import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { SidebarContext } from '@/components/organisms/sidebar/context';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useDesktopNavigation: () => ({
    canGoBack: true,
    canGoForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
  }),
  useIsElectronRuntime: () => true,
}));

vi.mock('@/components/atoms/UpdateAvailablePill', () => ({
  UpdateAvailablePill: ({ compact }: { readonly compact?: boolean }) => (
    <button
      type='button'
      data-testid='update-available-pill'
      data-compact={compact ? 'true' : 'false'}
    >
      Update
    </button>
  ),
}));

describe('DesktopTitlebar', () => {
  it('renders Electron titlebar controls in sidebar and main grid cells', () => {
    render(
      <SidebarContext.Provider
        value={{
          state: 'open',
          open: true,
          setOpen: vi.fn(),
          openMobile: false,
          setOpenMobile: vi.fn(),
          isMobile: false,
          toggleSidebar: vi.fn(),
        }}
      >
        <DesktopTitlebar />
      </SidebarContext.Provider>
    );

    expect(screen.getByTestId('electron-titlebar-row')).toBeInTheDocument();
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('update-available-pill'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-sidebar-toggle'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-back'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-forward'));
    expect(screen.getByTestId('update-available-pill')).toHaveAttribute(
      'data-compact',
      'true'
    );
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Go forward' })
    ).toBeInTheDocument();
  });
});
