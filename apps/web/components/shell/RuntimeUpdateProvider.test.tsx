import {
  act,
  fireEvent,
  render,
  render as renderRTL,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopUpdateContext } from '@/components/organisms/desktop-update/DesktopUpdateProvider';
import { renderDashboardNav } from '@/tests/utils/dashboard-nav-test-support';
import { RuntimeUpdateProvider } from './RuntimeUpdateProvider';

const state = vi.hoisted(() => ({
  desktop: true,
  available: false,
  downloaded: false,
  mismatch: false,
  install: vi.fn(async () => true),
}));
vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  useIsElectronRuntime: () => state.desktop,
  useDesktopUpdate: () => ({
    available: state.available,
    downloaded: state.downloaded,
    install: state.install,
  }),
}));
vi.mock('@/lib/hooks/useVersionMonitor', () => ({
  useVersionMonitor: () => ({
    hasMismatch: state.mismatch,
    mismatchInfo: { newVersion: '26.9.1' },
  }),
}));
function Surface({ inbox = true }: { inbox?: boolean }) {
  return (
    <RuntimeUpdateProvider>
      <main data-testid='page-content'>{inbox ? 'Inbox' : 'Chat'}</main>
    </RuntimeUpdateProvider>
  );
}
beforeEach(() => {
  Object.assign(state, {
    desktop: true,
    available: false,
    downloaded: false,
    mismatch: false,
  });
  state.install.mockReset();
  state.install.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());
function DesktopUpdateProbe() {
  const ctx = useDesktopUpdateContext();
  return (
    <span data-testid='desktop-update-state'>{ctx?.state.state ?? 'none'}</span>
  );
}

describe('runtime updates in the shell corner pill', () => {
  it('exposes the desktop update context to descendants (unsupported on web)', () => {
    render(
      <RuntimeUpdateProvider>
        <DesktopUpdateProbe />
      </RuntimeUpdateProvider>
    );
    expect(screen.getByTestId('desktop-update-state')).toHaveTextContent(
      'unsupported'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('announces an update in the shell corner pill beside the navigation', () => {
    state.available = true;
    state.downloaded = true;
    renderDashboardNav({
      renderFn: ui =>
        render(<RuntimeUpdateProvider>{ui}</RuntimeUpdateProvider>),
      overrides: { inboxNavigation: { state: 'empty', pendingCount: 0 } },
    });
    expect(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    ).toBeEnabled();
    expect(screen.getByTestId('runtime-update-pill')).toBeInTheDocument();
  });

  it('does not show a notification without a real update', () => {
    render(<Surface />);
    expect(screen.queryByTestId('runtime-update-pill')).not.toBeInTheDocument();
  });
  it('renders update status outside the page content area', () => {
    state.available = true;
    state.downloaded = true;
    render(<Surface />);
    const pill = screen.getByTestId('runtime-update-pill');
    expect(pill).toHaveClass('fixed');
    expect(screen.getByTestId('page-content')).not.toContainElement(pill);
    expect(screen.getByTestId('page-content')).not.toHaveTextContent(
      /Jovie to update|Updating Jovie/
    );
  });
  it('keeps a downloaded update pending across route views and installs only on explicit action', () => {
    state.available = true;
    state.downloaded = true;
    const { rerender } = render(<Surface inbox={false} />);
    rerender(<Surface />);
    expect(state.install).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    );
    expect(state.install).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toHaveAccessibleDescription(
      'Installing the update and restarting Jovie…'
    );
  });
  it('allows retry after a deferred desktop install failure', async () => {
    state.available = true;
    state.downloaded = true;
    let settleInstall: ((started: boolean) => void) | undefined;
    state.install.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          settleInstall = resolve;
        })
    );
    render(<Surface />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    );
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();

    await act(async () => settleInstall?.(false));
    const retry = screen.getByRole('button', {
      name: 'Restart Jovie to update',
    });
    expect(retry).toBeEnabled();
    expect(retry).toHaveAccessibleDescription(
      'Install the available update when you are ready.'
    );
    fireEvent.click(retry);
    expect(state.install).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();
  });
  it('restores the retry action if the desktop install promise rejects', async () => {
    state.available = true;
    state.downloaded = true;
    state.install.mockRejectedValueOnce(new Error('IPC channel closed'));
    render(<Surface />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Restart Jovie to update' })
      ).toBeEnabled()
    );
  });
  it('prevents restart while the download is incomplete', () => {
    state.available = true;
    render(<Surface />);
    expect(
      screen.getByRole('button', { name: 'Downloading Jovie update…' })
    ).toBeDisabled();
    expect(state.install).not.toHaveBeenCalled();
  });
  it('renders the pill through the imported renderer when mounted directly', () => {
    // Rendered with the imported testing-library render (not the Surface
    // helper) so the provider's own pill stays executable without children.
    state.available = true;
    state.downloaded = true;
    renderRTL(
      <RuntimeUpdateProvider>
        <div />
      </RuntimeUpdateProvider>
    );
    expect(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    ).toBeEnabled();
  });
  it('exposes the existing browser version mismatch in the same destination', () => {
    state.desktop = false;
    state.mismatch = true;
    render(<Surface />);
    expect(
      screen.getByRole('button', { name: 'Reload Jovie to update' })
    ).toHaveAccessibleDescription(
      'New Version Available (v26.9.1). Reload when ready.'
    );
  });
  it('reloads a browser update only after its explicit action', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    state.desktop = false;
    state.mismatch = true;
    render(<Surface />);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Jovie to update' })
    );
    expect(reload).toHaveBeenCalledOnce();
  });
});
