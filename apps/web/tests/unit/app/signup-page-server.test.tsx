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

vi.mock('@/app/(auth)/signup/SignUpPageClient', () => ({
  SignUpPageClient: () => null,
}));

describe('/signup page server redirect', () => {
  beforeEach(() => {
    vi.resetModules();
    resolveUserStateMock.mockReset();
    redirectMock.mockClear();
  });

  it('redirects authenticated visitors away from the sign-up surface', async () => {
    resolveUserStateMock.mockResolvedValueOnce({
      state: 'ACTIVE',
    });

    const { default: SignUpPage } = await import('@/app/(auth)/signup/page');

    await expect(
      SignUpPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/app');
    expect(resolveUserStateMock).toHaveBeenCalledWith({
      createDbUserIfMissing: false,
    });
  });

  it('renders the client shell for signed-out visitors', async () => {
    resolveUserStateMock.mockResolvedValueOnce({
      state: 'UNAUTHENTICATED',
    });

    const { default: SignUpPage } = await import('@/app/(auth)/signup/page');

    const result = await SignUpPage({ searchParams: Promise.resolve({}) });
    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
