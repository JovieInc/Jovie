import { describe, expect, test, vi } from 'vitest';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

const {
  mockGetWaitlistAccess,
  mockNotFound,
  mockRedirect,
  mockResolveUserState,
} = vi.hoisted(() => ({
  mockGetWaitlistAccess: vi.fn(),
  mockNotFound: vi.fn(),
  mockRedirect: vi.fn(),
  mockResolveUserState: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
  notFound: (...args: unknown[]) => {
    mockNotFound(...args);
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState,
  getWaitlistAccess: mockGetWaitlistAccess,
  resolveUserState: mockResolveUserState,
}));

describe('WaitlistPage', () => {
  test.each([
    { state: CanonicalUserState.BANNED, expectedRedirect: '/unavailable' },
    {
      state: CanonicalUserState.USER_CREATION_FAILED,
      expectedRedirect: '/error/user-creation-failed',
    },
    { state: CanonicalUserState.ACTIVE, expectedRedirect: '/app' },
    { state: CanonicalUserState.NEEDS_ONBOARDING, expectedRedirect: '/start' },
    { state: CanonicalUserState.UNAUTHENTICATED, expectedRedirect: '/start' },
    { state: CanonicalUserState.NEEDS_DB_USER, expectedRedirect: '/start' },
    {
      state: CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
      expectedRedirect: '/start',
    },
  ])('server-side redirects $state users to $expectedRedirect', async ({
    state,
    expectedRedirect,
  }) => {
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockResolveUserState.mockResolvedValue({
      state,
      context: { email: 'artist@example.com' },
    });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');

    await expect(WaitlistPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith(expectedRedirect);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  test('renders the waitlist confirmation view without redirecting for WAITLIST_PENDING', async () => {
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockResolveUserState.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
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
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(result.type).toBe(WaitlistSuccessView);
  });

  test.each([
    CanonicalUserState.WAITLIST_PENDING,
    CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
    CanonicalUserState.NEEDS_DB_USER,
  ])('never renders saved confirmation for %s without a durable pending entry', async state => {
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockResolveUserState.mockResolvedValue({
      state,
      context: { email: 'artist@example.com' },
    });
    mockGetWaitlistAccess.mockResolvedValue({ entryId: null, status: null });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');

    if (state === CanonicalUserState.WAITLIST_PENDING) {
      await expect(WaitlistPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNotFound).toHaveBeenCalledTimes(1);
      return;
    }

    await expect(WaitlistPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/start');
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
