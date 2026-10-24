import {
  act,
  fireEvent,
  render,
  render as renderRTL,
  screen,
  waitFor,
} from '@testing-library/react';
import { Toaster } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/feedback';
import { useDesktopUpdateContext } from '@/components/organisms/desktop-update/DesktopUpdateProvider';
import { APP_ROUTES } from '@/constants/routes';
import { renderDashboardNav } from '@/tests/utils/dashboard-nav-test-support';
import { RuntimeUpdateProvider } from './RuntimeUpdateProvider';
import { RuntimeUpdateToast } from './RuntimeUpdateToast';

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
      <Toaster />
      <main>{inbox ? 'Inbox' : 'Work'}</main>
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
afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
});
function DesktopUpdateProbe() {
  const ctx = useDesktopUpdateContext();
  return (
    <span data-testid='desktop-update-state'>{ctx?.state.state ?? 'none'}</span>
  );
}

describe('runtime update toast', () => {
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

  it('keeps the Inbox bell independent of runtime updates', () => {
    state.available = true;
    state.downloaded = true;
    const { container } = renderDashboardNav({
      renderFn: ui =>
        render(<RuntimeUpdateProvider>{ui}</RuntimeUpdateProvider>),
      overrides: { inboxNavigation: { state: 'empty', pendingCount: 0 } },
    });
    const bell = container.querySelector('[data-navigation-item-id="inbox"]');
    expect(bell).toHaveAccessibleName('Inbox');
    expect(bell).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(bell).toHaveAttribute('data-inbox-attention', 'empty');
    expect(bell?.querySelector('[data-inbox-runtime-update]')).toBeNull();
  });

  it('does not show a notification without a real update', () => {
    render(<Surface />);
    expect(
      screen.queryByRole('button', { name: /Jovie.*Update/ })
    ).not.toBeInTheDocument();
  });
  it('keeps a downloaded update pending across route views and installs only on explicit action', async () => {
    state.available = true;
    state.downloaded = true;
    const { rerender } = render(<Surface inbox={false} />);
    rerender(<Surface />);
    expect(state.install).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restart Jovie To Update' })
    );
    expect(state.install).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();
    expect(
      await screen.findByRole('button', { name: 'Updating Jovie…' })
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
      await screen.findByRole('button', { name: 'Restart Jovie To Update' })
    );
    expect(
      await screen.findByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();

    await act(async () => settleInstall?.(false));
    const retry = await screen.findByRole('button', {
      name: 'Restart Jovie To Update',
    });
    expect(retry).toBeEnabled();
    expect(retry).toHaveAccessibleDescription(
      'Install the available update when you are ready.'
    );
    fireEvent.click(retry);
    expect(state.install).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();
  });
  it('restores the retry action if the desktop install promise rejects', async () => {
    state.available = true;
    state.downloaded = true;
    state.install.mockRejectedValueOnce(new Error('IPC channel closed'));
    render(<Surface />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restart Jovie To Update' })
    );
    await waitFor(async () =>
      expect(
        await screen.findByRole('button', { name: 'Restart Jovie To Update' })
      ).toBeEnabled()
    );
  });
  it('prevents restart while the download is incomplete', async () => {
    state.available = true;
    render(<Surface />);
    expect(
      await screen.findByRole('button', { name: 'Downloading Jovie Update…' })
    ).toBeDisabled();
    expect(state.install).not.toHaveBeenCalled();
  });
  it('renders one update action in the shared toast renderer', async () => {
    // Rendered with the imported testing-library render (not the Surface
    // helper) so the runtime component evidence for the notification stays
    // executable: the update flow keeps its own dedicated notification test.
    state.available = true;
    state.downloaded = true;
    renderRTL(
      <>
        <Toaster />
        <RuntimeUpdateToast
          available
          busy={false}
          title='Restart Jovie To Update'
          description='Install the available update when you are ready.'
          apply={state.install}
        />
      </>
    );
    expect(
      await screen.findByRole('button', { name: 'Restart Jovie To Update' })
    ).toBeEnabled();
  });
  it('exposes the existing browser version mismatch in the same destination', async () => {
    state.desktop = false;
    state.mismatch = true;
    render(<Surface />);
    expect(
      await screen.findByRole('button', { name: 'Reload Jovie To Update' })
    ).toHaveAccessibleDescription(
      'New Version Available (v26.9.1). Reload when ready.'
    );
  });
  it('reloads a browser update only after its explicit action', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    state.desktop = false;
    state.mismatch = true;
    render(<Surface />);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reload Jovie To Update' })
    );
    expect(reload).toHaveBeenCalledOnce();
  });
});
