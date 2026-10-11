import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLockScreen } from './WorkspaceLockScreen';

const client = vi.hoisted(() => ({
  listUserPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  signInPasskey: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: client.listUserPasskeys,
      addPasskey: client.addPasskey,
    },
    signIn: { passkey: client.signInPasskey },
  },
}));

const desktop = vi.hoisted(() => ({
  isDesktopEnvironment: vi.fn(() => false),
  openCurrentOvieInBrowser: vi.fn(async () => ({ ok: true })),
  platformProbe: vi.fn(async () => true),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  isDesktopEnvironment: desktop.isDesktopEnvironment,
  openCurrentOvieInBrowser: desktop.openCurrentOvieInBrowser,
}));

const reload = vi.fn();
const fetchMock = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload },
  writable: true,
});

Object.defineProperty(window, 'PublicKeyCredential', {
  configurable: true,
  value: Object.assign(function PublicKeyCredential() {}, {
    isUserVerifyingPlatformAuthenticatorAvailable: desktop.platformProbe,
  }),
});
Object.defineProperty(navigator, 'credentials', {
  configurable: true,
  value: { get: vi.fn(), create: vi.fn() },
});
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      enabled: true,
      locked: false,
      unlockedUntil: '2099-01-01T00:00:00.000Z',
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  desktop.isDesktopEnvironment.mockReturnValue(false);
  desktop.platformProbe.mockResolvedValue(true);
  document.cookie = 'jovie_workspace_lock=; path=/; Max-Age=0';
  delete (globalThis as Record<string, unknown>)
    .__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__;
});

describe('WorkspaceLockScreen', () => {
  it('ignores a timed-out passkey after a successful retry', async () => {
    (
      globalThis as Record<string, unknown>
    ).__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__ = 25;
    let resolveOld!: (value: { data: object; error: null }) => void;
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey
      .mockReturnValueOnce(
        new Promise(done => {
          resolveOld = done;
        })
      )
      .mockResolvedValue({ data: {}, error: null });
    render(<WorkspaceLockScreen />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'prompt did not appear'
      )
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    resolveOld({ data: {}, error: null });
    await new Promise(done => setTimeout(done, 0));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps passkey retry as the sole action after native cancellation', async () => {
    desktop.isDesktopEnvironment.mockReturnValue(true);
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { code: 'AUTH_CANCELLED' },
    });
    render(<WorkspaceLockScreen />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('canceled')
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Continue in browser' })
    ).not.toBeInTheDocument();
  });
  it('keeps one action and a reserved status slot through desktop recovery', async () => {
    desktop.isDesktopEnvironment.mockReturnValue(true);
    desktop.platformProbe.mockResolvedValue(false);
    render(<WorkspaceLockScreen />);
    const action = screen.getByRole('button', { name: 'Unlock with passkey' });
    const slot = screen.getByTestId('workspace-lock-status');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    fireEvent.click(action);
    await screen.findByRole('button', { name: 'Continue in browser' });
    expect(screen.getAllByRole('button')).toEqual([action]);
    expect(screen.getByTestId('workspace-lock-status')).toBe(slot);
  });

  it('does not reload or unlock after the owning screen unmounts', async () => {
    let resolve!: (value: { data: object; error: null }) => void;
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    const view = render(<WorkspaceLockScreen />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );
    await waitFor(() => expect(client.signInPasskey).toHaveBeenCalledOnce());
    view.unmount();
    resolve({ data: {}, error: null });
    await new Promise(done => setTimeout(done, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it('renders a clear locked state with one primary, accessible unlock action', () => {
    render(<WorkspaceLockScreen />);
    expect(
      screen.getByRole('region', { name: 'Ovie Privacy Lock' })
    ).toBeTruthy();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    const unlock = screen.getByRole('button', { name: 'Unlock with passkey' });
    expect(unlock.className).toContain('bg-transparent');
    expect(unlock.contains(screen.getByTestId('workspace-lock-glyph'))).toBe(
      true
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(document.querySelector('[data-workspace-lock="true"]')).toBeTruthy();
    // Tim 2026-09-29: no circle around the fingerprint, desaturated and quiet.
    expect(
      screen.getByTestId('workspace-lock-glyph').parentElement?.className ?? ''
    ).not.toContain('rounded-full');
  });

  it('activates the same unlock action by keyboard', async () => {
    const user = userEvent.setup();
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<WorkspaceLockScreen />);

    const unlock = screen.getByRole('button', { name: 'Unlock with passkey' });
    unlock.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(client.signInPasskey).toHaveBeenCalledOnce();
  });

  it('suppresses duplicate unlock attempts while the passkey check is pending', async () => {
    const user = userEvent.setup();
    client.listUserPasskeys.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceLockScreen />);

    const unlock = screen.getByRole('button', { name: 'Unlock with passkey' });
    await user.click(unlock);
    expect(unlock).toBeDisabled();
    await user.click(unlock);

    expect(client.listUserPasskeys).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: /waiting for passkey/i })
    ).toBeDisabled();
  });

  it('unlocks through a confirmed server privacy receipt before clearing the legacy cookie', async () => {
    document.cookie = 'jovie_workspace_lock=1; path=/';
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<WorkspaceLockScreen />);

    fireEvent.click(screen.getByTestId('workspace-lock-glyph'));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(client.signInPasskey).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ovie/privacy-lock',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'unlock' }),
      })
    );
    expect(document.cookie).not.toContain('jovie_workspace_lock=1');
  });

  it('keeps the lock when the server does not confirm an unlock receipt', async () => {
    document.cookie = 'jovie_workspace_lock=1; path=/';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, locked: true, unlockedUntil: null }),
    });
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<WorkspaceLockScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(reload).not.toHaveBeenCalled();
    expect(document.cookie).toContain('jovie_workspace_lock=1');
  });

  it('asks for a previously enrolled passkey without changing credentials', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    render(<WorkspaceLockScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'No passkey is registered for this Ovie account'
      )
    );
    expect(client.addPasskey).not.toHaveBeenCalled();
    expect(client.signInPasskey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows an actionable error when the passkey prompt never appears', async () => {
    (
      globalThis as { __JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__?: number }
    ).__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__ = 25;
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceLockScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'passkey prompt did not appear'
      )
    );
    expect(reload).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    ).toBeTruthy();
  });

  it('offers the browser recovery in the desktop app when the ceremony cannot run', async () => {
    desktop.isDesktopEnvironment.mockReturnValue(true);
    desktop.platformProbe.mockResolvedValue(false);
    render(<WorkspaceLockScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('in your browser')
    );
    expect(
      screen.getByRole('button', { name: 'Continue in browser' })
    ).toBeTruthy();
    expect(client.signInPasskey).not.toHaveBeenCalled();
  });

  it('shows the error and keeps the lock on a failed unlock', async () => {
    document.cookie = 'jovie_workspace_lock=1; path=/';
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { message: 'Passkey denied' },
    });
    render(<WorkspaceLockScreen />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Passkey denied')
    );
    // Tim 2026-09-29: the error state is calmer and smaller, not red.
    expect(screen.getByRole('alert').className).not.toContain('destructive');
    expect(screen.getByRole('alert').className).toContain('text-xs');
    expect(reload).not.toHaveBeenCalled();
    expect(document.cookie).toContain('jovie_workspace_lock=1');
  });
});

describe('native browser recovery', () => {
  it('continues in independent browser without unlocking or reloading native', async () => {
    document.cookie = 'jovie_workspace_lock=1; path=/';
    desktop.isDesktopEnvironment.mockReturnValue(true);
    desktop.platformProbe.mockResolvedValue(false);
    desktop.openCurrentOvieInBrowser.mockResolvedValue({ ok: true });
    render(<WorkspaceLockScreen />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );
    const button = await screen.findByRole('button', {
      name: 'Continue in browser',
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This desktop session stays locked.'
      )
    );
    expect(desktop.openCurrentOvieInBrowser).toHaveBeenCalledWith();
    expect(reload).not.toHaveBeenCalled();
    expect(document.cookie).toContain('jovie_workspace_lock=1');
  });
  it('reports failure and allows retry while pending disables only local recovery', async () => {
    desktop.isDesktopEnvironment.mockReturnValue(true);
    desktop.platformProbe.mockResolvedValue(false);
    let resolve!: (value: { ok: boolean }) => void;
    desktop.openCurrentOvieInBrowser.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    render(<WorkspaceLockScreen />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue in browser' })
    );
    expect(
      screen.getByRole('button', { name: 'Opening browser…' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Opening browser…' })
    ).toHaveClass('min-w-52');
    expect(screen.getByTestId('workspace-lock-status')).toHaveClass('min-h-12');
    resolve({ ok: false });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not open your browser.'
      )
    );
    expect(
      screen.getByRole('button', { name: 'Continue in browser' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Continue in browser' })
    ).toHaveClass('min-w-52');
    expect(screen.getByTestId('workspace-lock-status')).toHaveClass('min-h-12');
    expect(reload).not.toHaveBeenCalled();
  });
});
