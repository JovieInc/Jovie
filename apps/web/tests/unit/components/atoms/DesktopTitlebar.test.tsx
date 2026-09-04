import { act, render, screen, waitFor } from '@testing-library/react';
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

  it.each([
    ['production', 'Stable'],
    ['staging', 'Canary'],
    ['local', 'Local'],
  ])('renders the %s build as a persistent %s release identity', async (channel, label) => {
    const version = channel === 'staging' ? '26.8.2-staging.1.1' : '26.8.1';
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel,
          version,
          sourceRevision: '8e42ec8d79cbee578971636b78bb80dc32c78b39',
          builtAt: channel === 'local' ? null : '2026-08-16T18:20:00.000Z',
          provenance: channel === 'local' ? 'development' : 'verified',
        }),
      },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        `${label} · ${version} · 8e42ec8`
      );
      expect(
        screen.getByLabelText(
          `${label} environment, version ${version}, source revision 8e42ec8d79cbee578971636b78bb80dc32c78b39`
        )
      ).toBeInTheDocument();
    });
  });

  it('reads exact package provenance from the validated main-process bridge', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'production',
          version: '26.8.2',
          sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
          builtAt: '2026-09-04T03:51:18.184Z',
          provenance: 'verified',
        }),
      },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Stable · 26.8.2 · 46b0f14'
      );
      expect(
        screen.getByLabelText(
          'Stable environment, version 26.8.2, source revision 46b0f1404837f9e20080a49b7577e554f5f5b778'
        )
      ).toBeInTheDocument();
    });
  });

  it.each([
    ['unverified', 'missing or mismatched packaged identity'],
    ['unverified', 'runtime version drift'],
  ])('fails closed for %s main-process provenance: %s', async provenance => {
    document.documentElement.dataset.desktopChannel = 'production';
    document.documentElement.dataset.desktopVersion = '26.8.2';
    document.documentElement.dataset.desktopSourceRevision =
      '8e42ec8d79cbee578971636b78bb80dc32c78b39';
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'production',
          version: '26.8.2',
          sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
          builtAt: '2026-09-04T03:51:18.184Z',
          provenance,
        }),
      },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Desktop · Version Unknown · Unverified'
      );
    });
  });

  it('rejects an invalid builtAt payload from the bridge', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'production',
          version: '26.8.2',
          sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
          builtAt: 42,
          provenance: 'verified',
        }),
      },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Desktop · Version Unknown · Unverified'
      );
    });
  });

  it.each([
    ['unknown channel', { channel: 'nightly' }],
    ['invalid version', { version: 'next' }],
    ['short revision', { sourceRevision: '46b0f14' }],
    ['missing verified revision', { sourceRevision: null }],
    ['missing verified build time', { builtAt: null }],
    ['verified local channel', { channel: 'local', builtAt: null }],
  ])('fails closed for a trusted payload with %s', async (_, override) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'production',
          version: '26.8.2',
          sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
          builtAt: '2026-09-04T03:51:18.184Z',
          provenance: 'verified',
          ...override,
        }),
      },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Desktop · Version Unknown · Unverified'
      );
    });
  });

  it('fails closed when the identity IPC request rejects', async () => {
    const getBuildIdentity = vi.fn().mockRejectedValue(new Error('IPC closed'));
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getBuildIdentity },
    });

    renderTitlebar();

    await waitFor(() => expect(getBuildIdentity).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
      'Desktop · Version Unknown · Unverified'
    );
  });

  it.each([
    null,
    'invalid',
  ])('fails closed for a non-object identity payload', async value => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getBuildIdentity: vi.fn().mockResolvedValue(value) },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Desktop · Version Unknown · Unverified'
      );
    });
  });

  it('ignores a stale identity response after the bridge changes', async () => {
    let resolveIdentity: ((value: object) => void) | undefined;
    const firstGetBuildIdentity = vi.fn(
      () =>
        new Promise<object>(resolve => {
          resolveIdentity = resolve;
        })
    );
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getBuildIdentity: firstGetBuildIdentity },
    });

    const view = renderTitlebar();
    await waitFor(() => expect(firstGetBuildIdentity).toHaveBeenCalledTimes(1));

    const secondGetBuildIdentity = vi.fn().mockResolvedValue({
      channel: 'staging',
      version: '26.8.3-staging.1.1',
      sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      builtAt: '2026-09-04T04:00:00.000Z',
      provenance: 'verified',
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getBuildIdentity: secondGetBuildIdentity },
    });
    view.rerender(
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
    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Canary · 26.8.3-staging.1.1 · bbbbbbb'
      );
    });

    await act(async () => {
      resolveIdentity?.({
        channel: 'production',
        version: '26.8.2',
        sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
        builtAt: '2026-09-04T03:51:18.184Z',
        provenance: 'verified',
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
      'Canary · 26.8.3-staging.1.1 · bbbbbbb'
    );
  });

  it('clears the old identity while a replacement bridge is pending', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'production',
          version: '26.8.2',
          sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
          builtAt: '2026-09-04T03:51:18.184Z',
          provenance: 'verified',
        }),
      },
    });
    const view = renderTitlebar();
    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Stable · 26.8.2 · 46b0f14'
      );
    });

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getBuildIdentity: vi.fn(() => new Promise(() => undefined)) },
    });
    view.rerender(
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

    expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
      'Desktop · Version Unknown · Unverified'
    );
  });

  it('ignores a stale identity rejection after the bridge changes', async () => {
    let rejectIdentity: ((reason: Error) => void) | undefined;
    const firstGetBuildIdentity = vi.fn(
      () =>
        new Promise<object>((_, reject) => {
          rejectIdentity = reject;
        })
    );
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getBuildIdentity: firstGetBuildIdentity },
    });

    const view = renderTitlebar();
    await waitFor(() => expect(firstGetBuildIdentity).toHaveBeenCalledTimes(1));
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'production',
          version: '26.8.2',
          sourceRevision: '46b0f1404837f9e20080a49b7577e554f5f5b778',
          builtAt: '2026-09-04T03:51:18.184Z',
          provenance: 'verified',
        }),
      },
    });
    view.rerender(
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
    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Stable · 26.8.2 · 46b0f14'
      );
    });

    await act(async () => {
      rejectIdentity?.(new Error('stale IPC closed'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
      'Stable · 26.8.2 · 46b0f14'
    );
  });

  it('does not let a stale document marker override an unverified bridge revision', async () => {
    document.documentElement.dataset.desktopSourceRevision =
      '8e42ec8d79cbee578971636b78bb80dc32c78b39';
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBuildIdentity: vi.fn().mockResolvedValue({
          channel: 'local',
          version: '26.8.2',
          sourceRevision: null,
          builtAt: null,
          provenance: 'development',
        }),
      },
    });

    renderTitlebar();

    await waitFor(() => {
      expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
        'Local · 26.8.2 · Unverified'
      );
    });
  });

  it('fails visibly when the installed shell lacks the validated identity bridge', () => {
    document.documentElement.dataset.desktopChannel = 'production';
    document.documentElement.dataset.desktopVersion = '26.8.1';

    renderTitlebar();

    expect(screen.getByTestId('electron-release-identity')).toHaveTextContent(
      'Desktop · Version Unknown · Unverified'
    );
    expect(
      screen.getByLabelText(
        'Desktop environment, version unknown, source revision unverified'
      )
    ).toBeInTheDocument();
  });
});
