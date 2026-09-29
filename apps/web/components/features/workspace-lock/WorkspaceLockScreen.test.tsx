import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ unlocked: true }) }))
);

afterEach(() => {
  vi.clearAllMocks();
  desktop.isDesktopEnvironment.mockReturnValue(false);
  desktop.platformProbe.mockResolvedValue(true);
  document.cookie = 'jovie_workspace_lock=; path=/; Max-Age=0';
});

describe('WorkspaceLockScreen', () => {
  it('renders the locked state with a calm, uncircled fingerprint and unlock copy', () => {
    render(<WorkspaceLockScreen />);
    expect(
      screen.getAllByRole('button', { name: /unlock to continue/i }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Unlock to continue')).toBeTruthy();
    expect(
      screen.getByText('Unlock to continue').closest('button')
    ).toBeTruthy();
    expect(document.querySelector('[data-workspace-lock="true"]')).toBeTruthy();
    // Tim 2026-09-29: no circle around the fingerprint, desaturated and quiet.
    const glyph = screen.getByTestId('workspace-lock-glyph');
    expect(glyph.getAttribute('class')).toContain('text-tertiary-token');
    expect(glyph.getAttribute('class')).not.toContain('destructive');
    expect(glyph.parentElement?.className ?? '').not.toContain('rounded-full');
  });

  it('unlocks via passkey, clears the lock cookie, and reloads', async () => {
    document.cookie = 'jovie_workspace_lock=1; path=/';
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<WorkspaceLockScreen />);

    fireEvent.click(screen.getByText('Unlock to continue'));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(client.signInPasskey).toHaveBeenCalledOnce();
    expect(document.cookie).not.toContain('jovie_workspace_lock=1');
  });

  it('enrolls a first passkey when none exists', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey.mockResolvedValue({ data: {}, error: null });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<WorkspaceLockScreen />);

    fireEvent.click(screen.getByText('Unlock to continue'));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(client.addPasskey).toHaveBeenCalledWith({ name: 'Ovie' });
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

    fireEvent.click(screen.getByText('Unlock to continue'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'passkey prompt did not appear'
      )
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('Unlock to continue')).toBeTruthy();
  });

  it('offers the browser recovery in the desktop app when the ceremony cannot run', async () => {
    desktop.isDesktopEnvironment.mockReturnValue(true);
    desktop.platformProbe.mockResolvedValue(false);
    render(<WorkspaceLockScreen />);

    fireEvent.click(screen.getByText('Unlock to continue'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('in your browser')
    );
    expect(
      screen.getByRole('button', { name: 'Open In Browser' })
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

    fireEvent.click(screen.getByText('Unlock to continue'));

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
