import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { SidebarContext } from '@/components/organisms/sidebar/context';

const electronRuntimeMock = vi.hoisted(() => ({
  isElectronRuntime: true,
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

vi.mock('@/components/atoms/UpdateAvailablePill', () => ({
  UpdateAvailablePill: () => (
    <button type='button' data-testid='update-available-pill'>
      Update
    </button>
  ),
}));

function renderTitlebar() {
  return render(
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
}

describe('DesktopTitlebar', () => {
  beforeEach(() => {
    electronRuntimeMock.isElectronRuntime = true;
  });

  it('renders Electron titlebar with nav controls, sidebar toggle, and update pill in the sidebar cell', () => {
    renderTitlebar();

    expect(screen.getByTestId('electron-titlebar-row')).toBeInTheDocument();

    // Sidebar toggle is in the sidebar cell (single canonical toggle)
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-sidebar-toggle'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-back'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-forward'));

    // Update pill is in the sidebar cell
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('update-available-pill'));

    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
  });

  it('renders no Electron controls in the browser runtime', () => {
    electronRuntimeMock.isElectronRuntime = false;

    renderTitlebar();

    expect(screen.getByTestId('electron-titlebar-row')).toBeEmptyDOMElement();
    expect(
      screen.queryByTestId('electron-titlebar-sidebar-cell')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('electron-sidebar-toggle')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('electron-nav-pill')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('update-available-pill')
    ).not.toBeInTheDocument();
  });

  it('keeps back/forward nav in the sidebar titlebar cell', () => {
    renderTitlebar();

    expect(screen.getByTestId('electron-nav-pill')).toBeInTheDocument();
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-pill'));
    expect(
      screen.getByTestId('electron-titlebar-main-cell')
    ).not.toContainElement(screen.getByTestId('electron-nav-pill'));
  });

  it('main cell is a plain drag region with no rounded card chrome', () => {
    renderTitlebar();

    const mainCell = screen.getByTestId('electron-titlebar-main-cell');
    const className = mainCell.className;
    // No rounded-top, no border, no content-surface background — the main cell
    // is a plain drag region. The elevated card lives in #main-content below.
    expect(className).not.toMatch(/rounded-t/);
    expect(className).not.toMatch(/\bborder\b/);
    expect(className).not.toMatch(/linear-app-content-surface/);
  });
});
