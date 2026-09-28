import {
  act,
  fireEvent,
  render,
  render as renderRTL,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxRuntimeNotification } from '@/components/features/opportunity-inbox/InboxRuntimeNotification';
import { APP_ROUTES } from '@/constants/routes';
import { renderDashboardNav } from '@/tests/utils/dashboard-nav-test-support';
import { RuntimeUpdateProvider } from './RuntimeUpdateProvider';

const state = vi.hoisted(() => ({
  desktop: true,
  available: false,
  downloaded: false,
  mismatch: false,
  install: vi.fn(async () => true),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
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
      {inbox ? <InboxRuntimeNotification /> : null}
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
describe('updates in the central Inbox', () => {
  it('shows runtime attention on the canonical shell Inbox bell', () => {
    state.available = true;
    state.downloaded = true;
    const { getByRole } = renderDashboardNav({
      renderFn: ui =>
        render(<RuntimeUpdateProvider>{ui}</RuntimeUpdateProvider>),
      overrides: { inboxNavigation: { state: 'empty', pendingCount: 0 } },
    });
    expect(
      getByRole('link', { name: 'Inbox — App Update Available' })
    ).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
  });

  it('does not show a notification without a real update', () => {
    render(<Surface />);
    expect(
      screen.queryByTestId('inbox-runtime-notification')
    ).not.toBeInTheDocument();
  });
  it('keeps a downloaded update pending across route views and installs only on explicit action', () => {
    state.available = true;
    state.downloaded = true;
    const { rerender } = render(<Surface inbox={false} />);
    rerender(<Surface />);
    expect(state.install).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart Jovie To Update' })
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
      screen.getByRole('button', { name: 'Restart Jovie To Update' })
    );
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();

    await act(async () => settleInstall?.(false));
    const retry = screen.getByRole('button', {
      name: 'Restart Jovie To Update',
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
      screen.getByRole('button', { name: 'Restart Jovie To Update' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Restart Jovie To Update' })
      ).toBeEnabled()
    );
  });
  it('prevents restart while the download is incomplete', () => {
    state.available = true;
    render(<Surface />);
    expect(
      screen.getByRole('button', { name: 'Downloading Jovie Update…' })
    ).toBeDisabled();
    expect(state.install).not.toHaveBeenCalled();
  });
  it('renders the notification through the imported renderer when mounted directly', () => {
    // Rendered with the imported testing-library render (not the Surface
    // helper) so the runtime component evidence for the notification stays
    // executable: the update flow keeps its own dedicated notification test.
    state.available = true;
    state.downloaded = true;
    renderRTL(
      <RuntimeUpdateProvider>
        <InboxRuntimeNotification />
      </RuntimeUpdateProvider>
    );
    expect(
      screen.getByRole('button', { name: 'Restart Jovie To Update' })
    ).toBeEnabled();
  });
  it('exposes the existing browser version mismatch in the same destination', () => {
    state.desktop = false;
    state.mismatch = true;
    render(<Surface />);
    expect(
      screen.getByRole('button', { name: 'Reload Jovie To Update' })
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
      screen.getByRole('button', { name: 'Reload Jovie To Update' })
    );
    expect(reload).toHaveBeenCalledOnce();
  });
});
