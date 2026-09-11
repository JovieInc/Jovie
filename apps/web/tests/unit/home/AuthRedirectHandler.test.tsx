import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

import { APP_ROUTES } from '@/constants/routes';
import {
  AuthRedirectHandler,
  hasActiveAuthSession,
} from '@/components/features/home/AuthRedirectHandler';

describe('hasActiveAuthSession', () => {
  it('returns false when the cookie is missing', () => {
    expect(hasActiveAuthSession('foo=bar')).toBe(false);
  });

  it('returns false when leftover Clerk activity cookie is zero', () => {
    expect(hasActiveAuthSession('__client_uat=0')).toBe(false);
  });

  it('returns true when leftover Clerk activity cookie is a non-zero value', () => {
    expect(hasActiveAuthSession('__client_uat=12345')).toBe(true);
  });

  it('returns true when a Better Auth session cookie is present', () => {
    expect(
      hasActiveAuthSession('better-auth.session_token=signed-session')
    ).toBe(true);
  });
});

describe('AuthRedirectHandler', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    document.cookie =
      '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('does not redirect or render loader for anonymous users', async () => {
    render(<AuthRedirectHandler />);

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });

    expect(
      screen.queryByTestId('auth-redirect-overlay')
    ).not.toBeInTheDocument();
  });

  it('renders loader and redirects authenticated users', async () => {
    document.cookie = 'better-auth.session_token=signed-session';

    render(<AuthRedirectHandler />);

    expect(screen.getByTestId('auth-redirect-overlay')).toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
    });
  });
});
