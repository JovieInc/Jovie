import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopTitlebar } from '@/components/atoms/DesktopTitlebar';
import { SidebarContext } from '@/components/organisms/sidebar/context';

const electronRuntimeMock = vi.hoisted(() => ({
  isElectronRuntime: true,
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
    useDesktopNavigation: () => ({
      canGoBack: true,
      canGoForward: true,
      goBack: vi.fn(),
      goForward: vi.fn(),
    }),
  };
});

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
    Reflect.deleteProperty(window, 'electronAPI');
    document.documentElement.removeAttribute('data-desktop-channel');
    document.documentElement.removeAttribute('data-desktop-version');
    document.documentElement.removeAttribute('data-desktop-source-revision');
    document.documentElement.removeAttribute('data-desktop-built-at');
  });

  it('renders Electron titlebar navigation without duplicating sidebar notifications', () => {
    renderTitlebar();

    expect(screen.getByTestId('electron-titlebar-row')).toBeInTheDocument();

    // Sidebar toggle is in the sidebar cell (single canonical toggle)
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-sidebar-toggle'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-traffic-light-safe-area'));
    expect(screen.getByTestId('electron-traffic-light-safe-area')).toHaveClass(
      'w-(--electron-traffic-light-safe-width)'
    );
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-back'));
    expect(
      screen.getByTestId('electron-titlebar-sidebar-cell')
    ).toContainElement(screen.getByTestId('electron-nav-forward'));

    expect(
      screen.queryByTestId('update-available-pill')
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('electron-sidebar-toggle').querySelector('svg')
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: 'New Chat' })
    ).not.toBeInTheDocument();
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

  it('does not expose build diagnostics in the workspace control row', () => {
    renderTitlebar();
    expect(
      screen.queryByTestId('electron-release-identity')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('electron-titlebar-main-cell')
    ).toBeEmptyDOMElement();
  });
});
