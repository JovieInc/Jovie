import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveUserStateMock, redirectMock } = vi.hoisted(() => ({
  resolveUserStateMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState: {
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    ACTIVE: 'ACTIVE',
  },
  resolveUserState: resolveUserStateMock,
}));

vi.mock('@/app/(auth)/signin/SignInPageClient', () => ({
  SignInPageClient: () => null,
}));

describe('/signin page server redirect', () => {
  beforeEach(() => {
    vi.resetModules();
    resolveUserStateMock.mockReset();
    redirectMock.mockClear();
  });

  it('redirects authenticated visitors away from the sign-in surface', async () => {
    resolveUserStateMock.mockResolvedValueOnce({
      state: 'ACTIVE',
    });

    const { default: SignInPage } = await import('@/app/(auth)/signin/page');

    await expect(
      SignInPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/app');
    expect(resolveUserStateMock).toHaveBeenCalledWith({
      createDbUserIfMissing: false,
    });
  });

  it('renders the client shell for signed-out visitors', async () => {
    resolveUserStateMock.mockResolvedValueOnce({
      state: 'UNAUTHENTICATED',
    });

    const { default: SignInPage } = await import('@/app/(auth)/signin/page');

    const result = await SignInPage({ searchParams: Promise.resolve({}) });
    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
