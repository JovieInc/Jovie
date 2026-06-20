import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedirect, mockResolveUserState } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockResolveUserState: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState: {
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    NEEDS_ONBOARDING: 'NEEDS_ONBOARDING',
    WAITLIST_PENDING: 'WAITLIST_PENDING',
    ACTIVE: 'ACTIVE',
  },
  resolveUserState: mockResolveUserState,
}));

vi.mock('../../../app/(auth)/signin/SignInPageClient', () => ({
  SignInPageClient: () => null,
}));

describe('signin page access gating', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockResolveUserState.mockReset();
  });

  it('redirects admitted authed users away from /signin', async () => {
    mockResolveUserState.mockResolvedValue({
      state: 'NEEDS_ONBOARDING',
    });

    const { default: SignInPage } = await import(
      '../../../app/(auth)/signin/page'
    );

    await expect(
      SignInPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/start?fresh_signup=true');
  });

  it('redirects waitlisted authed users to /waitlist', async () => {
    mockResolveUserState.mockResolvedValue({
      state: 'WAITLIST_PENDING',
    });

    const { default: SignInPage } = await import(
      '../../../app/(auth)/signin/page'
    );

    await expect(
      SignInPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/waitlist');
  });

  it('renders the sign-in client for signed-out visitors', async () => {
    mockResolveUserState.mockResolvedValue({
      state: 'UNAUTHENTICATED',
    });

    const { default: SignInPage } = await import(
      '../../../app/(auth)/signin/page'
    );

    const result = await SignInPage({ searchParams: Promise.resolve({}) });
    expect(result).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
