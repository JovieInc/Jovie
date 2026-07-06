import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JovieAuthDefaultsProvider,
  JovieAuthValuesProvider,
  signOut,
  useAuthSafe,
  useCanRenderAuthUi,
  useJovieAuth,
  useJovieSession,
  useJovieUser,
  useSessionSafe,
  useUserSafe,
} from '@/hooks/useJovieAuth';

const { useSessionMock, signOutMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}));

// Mock ONLY the Better Auth react entrypoint. The plugin factories in
// 'better-auth/client/plugins' stay real so lib/auth/client.ts exercises the
// actual 1.6.23 import paths and plugin construction.
vi.mock('better-auth/react', () => ({
  createAuthClient: vi.fn(() => ({
    useSession: useSessionMock,
    signOut: signOutMock,
  })),
}));

const originalLocationDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'location'
);

function overrideLocation() {
  const assignMock = vi.fn();
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      assign: assignMock,
      reload: vi.fn(),
    },
  });
  return assignMock;
}

function mockSignedInSession() {
  useSessionMock.mockReturnValue({
    data: {
      user: {
        id: 'ba_user_tim',
        email: 'tim@jov.ie',
        emailVerified: true,
        name: 'Tim White',
        image: 'https://lh3.googleusercontent.com/avatar',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      session: {
        id: 'ba_sess_1',
        userId: 'ba_user_tim',
        token: 'session-token',
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    },
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(),
  });
}

function renderWithWrapper(
  wrapper?: (props: { readonly children: ReactNode }) => ReactNode
) {
  return renderHook(
    () => ({
      auth: useAuthSafe(),
      session: useSessionSafe(),
      user: useUserSafe(),
      canRenderAuthUi: useCanRenderAuthUi(),
    }),
    wrapper ? { wrapper } : undefined
  );
}

afterEach(() => {
  vi.clearAllMocks();

  if (originalLocationDescriptor) {
    Object.defineProperty(globalThis, 'location', originalLocationDescriptor);
  }
});

describe('useJovieAuth', () => {
  it('returns signed-out defaults from JovieAuthDefaultsProvider', () => {
    const { result } = renderWithWrapper(({ children }) => (
      <JovieAuthDefaultsProvider>{children}</JovieAuthDefaultsProvider>
    ));

    expect(result.current.auth.isLoaded).toBe(true);
    expect(result.current.auth.isSignedIn).toBe(false);
    expect(result.current.auth.userId).toBeNull();
    expect(result.current.auth.sessionId).toBeNull();
    expect(result.current.user.user).toBeNull();
    expect(result.current.session.session).toBeNull();
    expect(result.current.canRenderAuthUi).toBe(false);
  });

  it('returns signed-out defaults outside any provider', () => {
    const { result } = renderWithWrapper();

    expect(result.current.auth.isSignedIn).toBe(false);
    expect(result.current.user.user).toBeNull();
    expect(result.current.session.session).toBeNull();
    expect(result.current.canRenderAuthUi).toBe(false);
  });

  it('maps a live Better Auth session without any Clerk provider mounted', () => {
    mockSignedInSession();

    const { result } = renderWithWrapper(({ children }) => (
      <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
    ));

    expect(result.current.user.isLoaded).toBe(true);
    expect(result.current.user.isSignedIn).toBe(true);
    expect(result.current.user.user).toEqual({
      id: 'ba_user_tim',
      emailAddresses: [
        { id: 'ba_email_ba_user_tim', emailAddress: 'tim@jov.ie' },
      ],
      primaryEmailAddress: {
        id: 'ba_email_ba_user_tim',
        emailAddress: 'tim@jov.ie',
      },
      imageUrl: 'https://lh3.googleusercontent.com/avatar',
      fullName: 'Tim White',
      firstName: 'Tim',
      lastName: 'White',
      username: null,
    });

    expect(result.current.auth.isSignedIn).toBe(true);
    expect(result.current.auth.userId).toBe('ba_user_tim');
    expect(result.current.auth.sessionId).toBe('ba_sess_1');

    expect(result.current.session.session).toEqual({
      id: 'ba_sess_1',
      userId: 'ba_user_tim',
    });

    expect(result.current.canRenderAuthUi).toBe(true);
  });

  it('fans one useSession subscription out to every consumer hook', () => {
    mockSignedInSession();

    renderWithWrapper(({ children }) => (
      <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
    ));

    // Four consumer hooks render above; only the provider subscribes.
    expect(useSessionMock).toHaveBeenCalledTimes(1);
  });

  it('reports loading until the initial session fetch settles', () => {
    useSessionMock.mockReturnValue({
      data: null,
      isPending: true,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderWithWrapper(({ children }) => (
      <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
    ));

    expect(result.current.auth.isLoaded).toBe(false);
    expect(result.current.user.isLoaded).toBe(false);
    expect(result.current.session.isLoaded).toBe(false);
    expect(result.current.auth.isSignedIn).toBe(false);
    expect(result.current.user.user).toBeNull();
  });

  it('resolves getToken to null — cookie sessions need no client token', async () => {
    mockSignedInSession();

    const { result } = renderWithWrapper(({ children }) => (
      <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
    ));

    await expect(result.current.auth.getToken()).resolves.toBeNull();
  });

  it('revokes the Better Auth session then hard-navigates on signOut', async () => {
    mockSignedInSession();
    signOutMock.mockResolvedValue({ data: { success: true }, error: null });
    const assignMock = overrideLocation();

    const { result } = renderWithWrapper(({ children }) => (
      <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
    ));

    await result.current.auth.signOut({ redirectUrl: '/' });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith('/');
  });

  it('defaults to /signin and still navigates when revocation fails', async () => {
    signOutMock.mockRejectedValue(new Error('network down'));
    const assignMock = overrideLocation();

    await signOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith('/signin');
  });

  it('does not call the auth server for signOut in defaults mode', async () => {
    const assignMock = overrideLocation();

    const { result } = renderWithWrapper(({ children }) => (
      <JovieAuthDefaultsProvider>{children}</JovieAuthDefaultsProvider>
    ));

    await result.current.auth.signOut({ redirectUrl: '/' });

    expect(signOutMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('exports Jovie aliases as the same bindings as the safe hooks', () => {
    expect(useJovieAuth).toBe(useAuthSafe);
    expect(useJovieUser).toBe(useUserSafe);
    expect(useJovieSession).toBe(useSessionSafe);
  });
});
