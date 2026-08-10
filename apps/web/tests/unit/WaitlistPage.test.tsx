import { describe, expect, test, vi } from 'vitest';

const { mockGetWaitlistAccess, mockRedirect, mockResolveUserState } =
  vi.hoisted(() => ({
    mockGetWaitlistAccess: vi.fn(),
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
  getWaitlistAccess: mockGetWaitlistAccess,
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
    mockGetWaitlistAccess.mockResolvedValue({
      entryId: 'entry-1',
      status: 'waitlisted',
    });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');
    const { WaitlistSuccessView } = await import(
      '@/components/features/waitlist/WaitlistSuccessView'
    );

    const result = await WaitlistPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.type).toBe(WaitlistSuccessView);
  });

  test.each([
    'WAITLIST_PENDING',
    'NEEDS_WAITLIST_SUBMISSION',
    'NEEDS_DB_USER',
  ])('never renders saved confirmation for %s without a durable pending entry', async state => {
    mockRedirect.mockClear();
    mockResolveUserState.mockResolvedValue({
      state,
      context: { email: 'artist@example.com' },
    });
    mockGetWaitlistAccess.mockResolvedValue({ entryId: null, status: null });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');
    const { WaitlistIntakeChat } = await import(
      '@/components/features/waitlist/WaitlistIntakeChat'
    );
    const result = await WaitlistPage();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.type).toBe(WaitlistIntakeChat);
  });
});
