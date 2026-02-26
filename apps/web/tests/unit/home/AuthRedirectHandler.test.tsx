import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

import {
  AuthRedirectHandler,
  hasActiveClerkSession,
} from '@/components/home/AuthRedirectHandler';
import { APP_ROUTES } from '@/constants/routes';

describe('hasActiveClerkSession', () => {
  it('returns false when the cookie is missing', () => {
    expect(hasActiveClerkSession('foo=bar')).toBe(false);
  });

  it('returns false when Clerk activity cookie is zero', () => {
    expect(hasActiveClerkSession('__client_uat=0')).toBe(false);
  });

  it('returns true when Clerk activity cookie is a non-zero value', () => {
    expect(hasActiveClerkSession('__client_uat=12345')).toBe(true);
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
      screen.queryByLabelText(/redirecting to your dashboard/i)
    ).not.toBeInTheDocument();
  });

  it('renders loader and redirects authenticated users', async () => {
    document.cookie = '__client_uat=1700000000';

    render(<AuthRedirectHandler />);

    expect(
      screen.getByLabelText(/redirecting to your dashboard/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
    });
  });
});
