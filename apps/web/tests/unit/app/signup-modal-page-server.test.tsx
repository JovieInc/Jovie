import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveUserStateMock, redirectMock, connectionMock } = vi.hoisted(
  () => ({
    resolveUserStateMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    connectionMock: vi.fn().mockResolvedValue(undefined),
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/server', () => ({
  connection: connectionMock,
}));

vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState: {
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    ACTIVE: 'ACTIVE',
  },
  resolveUserState: resolveUserStateMock,
}));

vi.mock('@/app/@auth/(.)signup/SignupModalClient', () => ({
  SignupModalClient: () => null,
}));

describe('intercepted /signup modal server redirect', () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    // These fixtures exercise the open default (Tim, 2026-11-09); the closed
    // kill switch is covered in public-signup-closed.test.tsx.
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'false');
    vi.resetModules();
    resolveUserStateMock.mockReset();
    redirectMock.mockClear();
    connectionMock.mockClear();
    connectionMock.mockResolvedValue(undefined);
  });

  it('redirects authenticated visitors instead of rendering an empty modal', async () => {
    resolveUserStateMock.mockResolvedValueOnce({
      state: 'ACTIVE',
    });

    const { default: SignupModalPage } = await import(
      '@/app/@auth/(.)signup/page'
    );

    await expect(
      SignupModalPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/app');
    expect(resolveUserStateMock).toHaveBeenCalledWith({
      createDbUserIfMissing: false,
    });
  });

  it('renders the intercepted modal for signed-out visitors', async () => {
    resolveUserStateMock.mockResolvedValueOnce({
      state: 'UNAUTHENTICATED',
    });

    const { default: SignupModalPage } = await import(
      '@/app/@auth/(.)signup/page'
    );

    const result = await SignupModalPage({
      searchParams: Promise.resolve({}),
    });
    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
