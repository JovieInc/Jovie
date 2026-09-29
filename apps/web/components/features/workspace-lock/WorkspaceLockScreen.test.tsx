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
  platformProbe: vi.fn(async () => true),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  isDesktopEnvironment: desktop.isDesktopEnvironment,
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
});

describe('WorkspaceLockScreen', () => {
  it('renders a clear locked state with one primary, accessible unlock action', () => {
    render(<WorkspaceLockScreen />);
    expect(
      screen.getByRole('heading', { name: 'Ovie Is Locked' })
    ).toBeTruthy();
    expect(screen.getByText("Verify it's you to continue.")).toBeTruthy();
    const unlock = screen.getByRole('button', { name: 'Unlock with passkey' });
    expect(unlock.className).toContain('bg-btn-primary');
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
    const openInBrowser = screen.getByRole('button', {
      name: 'Open In Browser',
    });
    expect(openInBrowser).toBeTruthy();
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(openInBrowser);
    expect(openWindow).toHaveBeenCalledWith(
      window.location.href,
      '_blank',
      'noopener,noreferrer'
    );
    openWindow.mockRestore();
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
