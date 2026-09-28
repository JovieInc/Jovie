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

const reload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload },
  writable: true,
});

afterEach(() => {
  vi.clearAllMocks();
  document.cookie = 'jovie_workspace_lock=; path=/; Max-Age=0';
});

describe('WorkspaceLockScreen', () => {
  it('renders the locked state with a red fingerprint and unlock copy', () => {
    render(<WorkspaceLockScreen />);
    expect(
      screen.getAllByRole('button', { name: /unlock to continue/i }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Unlock to continue')).toBeTruthy();
    expect(
      screen.getByText('Unlock to continue').closest('button')
    ).toBeTruthy();
    expect(document.querySelector('[data-workspace-lock="true"]')).toBeTruthy();
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
    expect(reload).not.toHaveBeenCalled();
    expect(document.cookie).toContain('jovie_workspace_lock=1');
  });
});
