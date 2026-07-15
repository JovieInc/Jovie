import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityPageClient } from './IdentityPageClient';

const { oauthQuery, sendOtp, verify } = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verify: vi.fn(),
  oauthQuery:
    'client_id=logyourbody-web&redirect_uri=https%3A%2F%2Flogyourbody.com%2Fapi%2Fauth%2Fcallback&sig=test',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ oauth_query: oauthQuery }),
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
  authClient: { phoneNumber: { sendOtp, verify } },
}));

describe('IdentityPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendOtp.mockResolvedValue({ data: {}, error: null });
    verify.mockResolvedValue({ data: {}, error: null });
  });

  it('renders an SMS-only LogYourBody sign-in surface', () => {
    render(<IdentityPageClient />);

    expect(
      screen.getByRole('heading', { name: 'Continue to LogYourBody' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
    expect(screen.queryByText(/google|apple|email/i)).not.toBeInTheDocument();
  });

  it('normalizes a US number and sends a Twilio-backed code', async () => {
    render(<IdentityPageClient />);
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '(415) 555-1212' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text me a code' }));

    await waitFor(() =>
      expect(sendOtp).toHaveBeenCalledWith({ phoneNumber: '+14155551212' })
    );
    expect(
      await screen.findByLabelText('Verification code')
    ).toBeInTheDocument();
  });

  it('preserves the signed OAuth query when verifying the code', async () => {
    render(<IdentityPageClient />);
    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '4155551212' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    await screen.findByLabelText('Verification code');
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith({
        phoneNumber: '+14155551212',
        code: '123456',
        oauth_query: oauthQuery,
      })
    );
  });
});
