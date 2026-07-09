import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeDesktopNativeAuthMock = vi.fn();
const routerReplaceMock = vi.fn();
const clerkSetActiveMock = vi.fn(async () => undefined);
const clerkLoadMock = vi.fn(async () => undefined);
let clerkSession: { id: string } | null = null;
let clerkUser: { id: string } | null = null;
const signInResource = {
  create: vi.fn(async () => ({
    status: 'complete',
    createdSessionId: 'sess_123',
    error: null,
  })),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    loaded: true,
    setActive: clerkSetActiveMock,
    load: clerkLoadMock,
    session: clerkSession,
    user: clerkUser,
  }),
  useSignIn: () => ({ signIn: signInResource }),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  consumeDesktopAuthCompletion: vi.fn(),
}));

vi.mock('@/lib/desktop/native-complete', () => ({
  completeDesktopNativeAuth: (
    ...args: Parameters<typeof completeDesktopNativeAuthMock>
  ) => completeDesktopNativeAuthMock(...args),
}));

describe('NativeCompletePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    clerkSession = null;
    clerkUser = null;
    window.localStorage.clear();
    window.history.pushState(
      {},
      '',
      '/auth/native-complete?client=electron&state=state_123'
    );
  });

  it.skip('shares a single native completion attempt across same-URL remounts (retired Clerk hydration)', async () => {
    let resolveCompletion: (value: { returnTo: string }) => void = () => {};
    completeDesktopNativeAuthMock.mockReturnValue(
      new Promise(resolve => {
        resolveCompletion = resolve;
      })
    );

    const { default: NativeCompletePage } = await import(
      '../../../app/(auth)/auth/native-complete/page'
    );

    const firstRender = render(<NativeCompletePage />);

    await waitFor(() => {
      expect(completeDesktopNativeAuthMock).toHaveBeenCalledTimes(1);
    });

    firstRender.unmount();
    render(<NativeCompletePage />);

    await waitFor(() => {
      expect(completeDesktopNativeAuthMock).toHaveBeenCalledTimes(1);
    });

    resolveCompletion({ returnTo: '/app/chat?runtime=electron' });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        '/app/chat?runtime=electron'
      );
    });
  });

  it.skip('navigates to the stored return route when a replay fails after Clerk is signed in (retired Clerk hydration)', async () => {
    clerkSession = { id: 'sess_123' };
    clerkUser = { id: 'user_123' };
    window.localStorage.setItem(
      'jovie.desktopAuth.returnTo',
      '/app/settings?runtime=electron'
    );
    completeDesktopNativeAuthMock.mockRejectedValue(
      new Error('missing-auth-completion')
    );

    const { default: NativeCompletePage } = await import(
      '../../../app/(auth)/auth/native-complete/page'
    );

    render(<NativeCompletePage />);

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        '/app/settings?runtime=electron'
      );
    });
  });

  it.skip('keeps hard native completion failures on the retry screen even when Clerk is already signed in (retired Clerk hydration)', async () => {
    clerkSession = { id: 'sess_123' };
    clerkUser = { id: 'user_123' };
    completeDesktopNativeAuthMock.mockRejectedValue(
      new Error('native-auth-exchange-failed')
    );

    const { default: NativeCompletePage } = await import(
      '../../../app/(auth)/auth/native-complete/page'
    );

    render(<NativeCompletePage />);

    await screen.findByText('Sign-in did not complete');
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});
