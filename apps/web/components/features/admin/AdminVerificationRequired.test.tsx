import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminVerificationRequired } from './AdminVerificationRequired';

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

vi.mock('@/lib/desktop/electron-bridge', () => ({
  isDesktopEnvironment: () => false,
}));

Object.defineProperty(window, 'PublicKeyCredential', {
  configurable: true,
  value: function PublicKeyCredential() {},
});
Object.defineProperty(navigator, 'credentials', {
  configurable: true,
  value: { get: vi.fn(), create: vi.fn() },
});
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ unlocked: true }) }))
);

const reload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload },
  writable: true,
});

describe('AdminVerificationRequired', () => {
  it('announces the default verification message with an unlock action', () => {
    render(<AdminVerificationRequired />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Admin verification required to load this data.'
    );
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });

  it('renders a caller-provided message', () => {
    render(
      <AdminVerificationRequired message='Admin verification required to load pipeline settings.' />
    );

    expect(
      screen.getByText('Admin verification required to load pipeline settings.')
    ).toBeInTheDocument();
  });

  it('surfaces the step-up error and a retry instead of looping silently', async () => {
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { message: 'Passkey denied' },
    });
    render(<AdminVerificationRequired />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Passkey denied')
    );
    expect(
      screen.getByRole('button', { name: 'Try again' })
    ).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
