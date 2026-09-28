import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminVerificationRequired } from './AdminVerificationRequired';

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: vi.fn(),
      addPasskey: vi.fn(),
    },
    signIn: { passkey: vi.fn() },
  },
}));

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
});
