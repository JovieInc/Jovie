import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { social, params } = vi.hoisted(() => ({
  social: vi.fn(),
  params: new URLSearchParams('redirect_url=%2Fapp%3Ffrom%3Dmodal'),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => params }));
vi.mock('@/components/auth/AuthModalShell', () => ({
  AuthModalShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/features/auth/AuthenticatedAuthEntryGuard', () => ({
  AuthenticatedAuthEntryGuard: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock('@/components/features/auth/GoogleOneTap', () => ({
  GoogleOneTap: () => null,
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: { social },
    emailOtp: { sendVerificationOtp: vi.fn() },
  },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  trackFunnelStep: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));

import { SigninModalClient } from '@/app/@auth/(.)signin/SigninModalClient';
import { SignupModalClient } from '@/app/@auth/(.)signup/SignupModalClient';

for (const [mode, Component] of [
  ['signin', SigninModalClient],
  ['signup', SignupModalClient],
] as const) {
  describe(`${mode} modal social auth`, () => {
    beforeEach(() => {
      social.mockReset();
      localStorage.clear();
    });

    for (const provider of ['apple', 'google'] as const) {
      it(`${provider} preserves callback intent and recovers from a resolved error`, async () => {
        social.mockResolvedValueOnce({ error: { message: 'unavailable' } });
        render(<Component />);
        const name = `Continue with ${provider === 'apple' ? 'Apple' : 'Google'}`;
        const button = screen.getByRole('button', { name });
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        await waitFor(() =>
          expect(social).toHaveBeenCalledWith({
            provider,
            callbackURL: '/app?from=modal',
            newUserCallbackURL: '/app?from=modal',
            errorCallbackURL: `/${mode}?redirect_url=%2Fapp%3Ffrom%3Dmodal&error=oauth_failed`,
          })
        );
        expect(
          await screen.findByText(/could not start sign-(in|up)/i)
        ).toBeVisible();
        expect(button).toBeEnabled();
      });

      it(`${provider} recovers from a rejected request`, async () => {
        social.mockRejectedValueOnce(new Error('network failure'));
        render(<Component />);
        const button = screen.getByRole('button', {
          name: `Continue with ${provider === 'apple' ? 'Apple' : 'Google'}`,
        });
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        expect(
          await screen.findByText(/could not start sign-(in|up)/i)
        ).toBeVisible();
        expect(button).toBeEnabled();
      });
    }
  });
}
