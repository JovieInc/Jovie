import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityPageClient } from './IdentityPageClient';

const { signInSocial, params } = vi.hoisted(() => ({
  signInSocial: vi.fn(),
  params: {
    value:
      'client_id=logyourbody-web&redirect_uri=https%3A%2F%2Flogyourbody.com%2Fapi%2Fauth%2Fcallback&sig=test',
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(params.value),
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
    params.value =
      'client_id=logyourbody-web&redirect_uri=https%3A%2F%2Flogyourbody.com%2Fapi%2Fauth%2Fcallback&sig=test';
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
      expect(signInSocial).toHaveBeenCalledWith({
        provider: 'apple',
        callbackURL: '/',
        errorCallbackURL: `/identity?${params.value}`,
      })
    );
  });

  it('shows a generic error on callback return and clears it for a retry', async () => {
    params.value +=
      '&error=access_denied&error_description=untrusted-provider-text';
    render(<IdentityPageClient />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Apple sign in could not be started. Try again.'
    );
    expect(
      screen.queryByText('untrusted-provider-text')
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Apple' })
    );
    await waitFor(() => expect(signInSocial).toHaveBeenCalled());
    const request = signInSocial.mock.calls[0][0];
    expect(request.errorCallbackURL).not.toContain('error=');
    expect(request.errorCallbackURL).not.toContain('error_description');
    expect(request.errorCallbackURL).toContain('sig=test');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restores the action when the request throws', async () => {
    signInSocial.mockRejectedValue(new Error('network failure'));
    render(<IdentityPageClient />);
    const apple = screen.getByRole('button', { name: 'Continue with Apple' });
    fireEvent.click(apple);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Apple sign in could not be started. Try again.'
    );
    expect(apple).toBeEnabled();
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

  it('restores the Apple sign-in action after a cancelled browser round trip', async () => {
    let rejectFirstAttempt: (reason?: unknown) => void = () => {};
    signInSocial
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectFirstAttempt = reject;
        })
      )
      .mockReturnValueOnce(new Promise(() => {}));
    render(<IdentityPageClient />);

    const apple = screen.getByRole('button', { name: 'Continue with Apple' });
    fireEvent.click(apple);
    expect(apple).toBeDisabled();

    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });
    globalThis.dispatchEvent(pageShow);

    await waitFor(() => expect(apple).toBeEnabled());

    fireEvent.click(apple);
    expect(apple).toBeDisabled();

    rejectFirstAttempt(new Error('cancelled attempt settled late'));

    await waitFor(() => expect(apple).toBeDisabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
