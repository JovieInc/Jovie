import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxRuntimeNotification } from '@/components/features/opportunity-inbox/InboxRuntimeNotification';
import { RuntimeUpdateProvider } from './RuntimeUpdateProvider';
import { SidebarInboxButton } from './SidebarInboxButton';

const state = vi.hoisted(() => ({
  desktop: true,
  available: false,
  downloaded: false,
  mismatch: false,
  install: vi.fn(),
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
      <SidebarInboxButton availability={{ state: 'empty', pendingCount: 0 }} />
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
});
afterEach(() => vi.unstubAllGlobals());
describe('updates in the central Inbox', () => {
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
    expect(
      screen.getByRole('link', { name: 'Inbox — App Update Available' })
    ).toHaveAttribute('href', '/app');
    rerender(<Surface />);
    expect(state.install).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart Jovie To Update' })
    );
    expect(state.install).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();
  });
  it('prevents restart while the download is incomplete', () => {
    state.available = true;
    render(<Surface />);
    expect(
      screen.getByRole('button', { name: 'Downloading Jovie Update…' })
    ).toBeDisabled();
    expect(state.install).not.toHaveBeenCalled();
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
    expect(
      screen.getByRole('link', { name: 'Inbox — App Update Available' })
    ).toHaveAttribute('href', '/app');
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
