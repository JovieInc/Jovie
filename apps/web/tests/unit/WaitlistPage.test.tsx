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
  test('server-side redirects onboarding-ready users to /onboarding', async () => {
    mockResolveUserState.mockResolvedValue({
      state: 'NEEDS_ONBOARDING',
      context: { email: 'artist@example.com' },
    });

    const { default: WaitlistPage } = await import('../../app/waitlist/page');

    await expect(WaitlistPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });
});
