import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminStepUpButton } from './AdminStepUpButton';

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

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdminStepUpButton', () => {
  it('renders the unlock action in the idle state', () => {
    render(<AdminStepUpButton status='idle' onUnlock={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('is disabled while the passkey ceremony runs', () => {
    render(<AdminStepUpButton status='working' onUnlock={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Waiting for passkey…' })
    ).toBeDisabled();
  });

  it('offers a retry after a failed attempt', () => {
    render(<AdminStepUpButton status='error' onUnlock={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('invokes the provided unlock handler', () => {
    const onUnlock = vi.fn();
    render(<AdminStepUpButton status='idle' onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(onUnlock).toHaveBeenCalledOnce();
  });
});
