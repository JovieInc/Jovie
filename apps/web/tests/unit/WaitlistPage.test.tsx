import { describe, expect, test, vi } from 'vitest';

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
    ACTIVE: 'ACTIVE',
    BANNED: 'BANNED',
    NEEDS_ONBOARDING: 'NEEDS_ONBOARDING',
    NEEDS_WAITLIST_SUBMISSION: 'NEEDS_WAITLIST_SUBMISSION',
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    USER_CREATION_FAILED: 'USER_CREATION_FAILED',
    WAITLIST_PENDING: 'WAITLIST_PENDING',
  },
  resolveUserState: mockResolveUserState,
}));

describe('WaitlistPage', () => {
  test.each([
    { state: 'BANNED', expectedRedirect: '/unavailable' },
    {
      state: 'USER_CREATION_FAILED',
      expectedRedirect: '/error/user-creation-failed',
    },
    { state: 'ACTIVE', expectedRedirect: '/app' },
    { state: 'NEEDS_ONBOARDING', expectedRedirect: '/start' },
    // JOV-2161: unauthenticated visitors must funnel to /start, not loop
    // back through the proxy's needsWaitlist rewrite.
    { state: 'UNAUTHENTICATED', expectedRedirect: '/start' },
  ])('server-side redirects $state users to $expectedRedirect', async ({
    state,
    expectedRedirect,
  }) => {
    mockRedirect.mockClear();
    mockResolveUserState.mockResolvedValue({
      state,
      context: { email: 'artist@example.com' },
    });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');

    await expect(WaitlistPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith(expectedRedirect);
  });

  test('renders the waitlist confirmation view without redirecting for WAITLIST_PENDING', async () => {
    mockRedirect.mockClear();
    mockResolveUserState.mockResolvedValue({
      state: 'WAITLIST_PENDING',
      context: { email: 'artist@example.com' },
    });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');
    const { WaitlistSuccessView } = await import(
      '@/components/features/waitlist/WaitlistSuccessView'
    );

    const result = await WaitlistPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.type).toBe(WaitlistSuccessView);
  });
});
