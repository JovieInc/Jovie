import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClerkSafeBootstrapProvider,
  ClerkSafeDefaultsProvider,
  useAuthSafe,
  useSessionSafe,
  useUserSafe,
} from '@/hooks/useClerkSafe';
import type { ClientAuthBootstrap } from '@/lib/auth/dev-test-auth-types';

function renderWithWrapper(
  wrapper: (props: { readonly children: ReactNode }) => ReactNode
) {
  return renderHook(
    () => ({
      auth: useAuthSafe(),
      session: useSessionSafe(),
      user: useUserSafe(),
    }),
    { wrapper }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useClerkSafe', () => {
  it('returns signed-out defaults when Clerk is bypassed without bootstrap data', () => {
    const { result } = renderWithWrapper(({ children }) => (
      <ClerkSafeDefaultsProvider>{children}</ClerkSafeDefaultsProvider>
    ));

    expect(result.current.auth.isSignedIn).toBe(false);
    expect(result.current.auth.userId).toBeNull();
    expect(result.current.user.user).toBeNull();
    expect(result.current.session.session).toBeNull();
  });

  it('returns an authenticated synthetic Clerk session from browse bootstrap data', () => {
    const bootstrap: ClientAuthBootstrap = {
      isAuthenticated: true,
      userId: 'user_creator',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      persona: 'creator',
    };

    const { result } = renderWithWrapper(({ children }) => (
      <ClerkSafeBootstrapProvider bootstrap={bootstrap}>
        {children}
      </ClerkSafeBootstrapProvider>
    ));

    expect(result.current.auth.isSignedIn).toBe(true);
    expect(result.current.auth.userId).toBe('user_creator');
    expect(result.current.user.user).toEqual(
      expect.objectContaining({
        username: 'browse-test-user',
        fullName: 'Browse Test User',
      })
    );
    expect(result.current.session.session).toEqual(
      expect.objectContaining({
        id: 'sess_dev_test_creator',
      })
    );
  });

  it('clears the local dev session when synthetic signOut is called', async () => {
    const bootstrap: ClientAuthBootstrap = {
      isAuthenticated: true,
      userId: 'user_admin',
      email: 'admin+clerk_test@jov.ie',
      username: 'browse-admin-user',
      fullName: 'Browse Admin',
      isAdmin: true,
      persona: 'admin',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const assignMock = vi.fn();

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        assign: assignMock,
        reload: vi.fn(),
      },
    });

    const { result } = renderWithWrapper(({ children }) => (
      <ClerkSafeBootstrapProvider bootstrap={bootstrap}>
        {children}
      </ClerkSafeBootstrapProvider>
    ));

    await result.current.auth.signOut({ redirectUrl: '/signin' });

    expect(fetchMock).toHaveBeenCalledWith('/api/dev/test-auth/session', {
      method: 'DELETE',
      credentials: 'include',
    });
    expect(assignMock).toHaveBeenCalledWith('/signin');
  });
});
