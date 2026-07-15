import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityPageClient } from './IdentityPageClient';

const { signInSocial } = vi.hoisted(() => ({
  signInSocial: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams({
      client_id: 'logyourbody-web',
      redirect_uri: 'https://logyourbody.com/api/auth/callback',
      sig: 'test',
    }),
}));

vi.mock('@/features/auth', () => ({
  AuthLayout: ({
    children,
    formTitle,
  }: {
    children: ReactNode;
    formTitle: string;
  }) => (
    <main>
      <h1>{formTitle}</h1>
      {children}
    </main>
  ),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: { signIn: { social: signInSocial } },
}));

describe('IdentityPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInSocial.mockResolvedValue({ data: {}, error: null });
  });

  it('renders an Apple-only LogYourBody sign-in surface', () => {
    render(<IdentityPageClient />);

    expect(
      screen.getByRole('heading', { name: 'Continue to LogYourBody' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/google|phone|text me|email/i)
    ).not.toBeInTheDocument();
  });

  it('starts Apple through Better Auth', async () => {
    render(<IdentityPageClient />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Apple' })
    );

    await waitFor(() =>
      expect(signInSocial).toHaveBeenCalledWith({ provider: 'apple' })
    );
  });

  it('shows a recoverable error when Apple cannot start', async () => {
    signInSocial.mockResolvedValue({ data: null, error: { message: 'nope' } });
    render(<IdentityPageClient />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Apple' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Apple sign in could not be started. Try again.'
    );
  });
});
