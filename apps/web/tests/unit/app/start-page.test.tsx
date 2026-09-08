import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

const {
  getOrMintOnboardingSessionIdMock,
  getWaitlistAccessMock,
  redirectMock,
  resolveUserStateMock,
} = vi.hoisted(() => ({
  getOrMintOnboardingSessionIdMock: vi.fn(),
  getWaitlistAccessMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  resolveUserStateMock: vi.fn().mockResolvedValue({
    state: 'UNAUTHENTICATED',
    redirectTo: '/signin',
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: ({ sessionLabel }: { readonly sessionLabel: string }) => (
    <div data-session-label={sessionLabel} data-testid='onboarding-shell' />
  ),
}));

vi.mock('@/lib/onboarding/session', () => ({
  getOrMintOnboardingSessionId: getOrMintOnboardingSessionIdMock,
}));

// The /start page resolves canonical access state server-side via
// `resolveUserState` (Clerk `auth()` → `server-only`). Mock the gate so the
// page module can be imported in the jsdom unit environment.
vi.mock('@/lib/auth/gate', () => ({
  getWaitlistAccess: getWaitlistAccessMock,
  resolveUserState: resolveUserStateMock,
}));

describe('/start page', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getWaitlistAccessMock.mockReset();
    getWaitlistAccessMock.mockResolvedValue({ entryId: null, status: null });
    resolveUserStateMock.mockReset();
    resolveUserStateMock.mockResolvedValue({
      state: CanonicalUserState.UNAUTHENTICATED,
      redirectTo: '/signin',
    });
  });

  it('keeps a pre-receipt WAITLIST_PENDING user in /start so the canonical claim can finish', async () => {
    resolveUserStateMock.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
      context: { email: 'artist@example.com' },
    });

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    render(await StartPage());

    expect(getWaitlistAccessMock).toHaveBeenCalledExactlyOnceWith(
      'artist@example.com'
    );
    expect(screen.getByTestId('onboarding-shell')).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects WAITLIST_PENDING to the receipt only when a durable pending entry exists', async () => {
    resolveUserStateMock.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
      context: { email: 'artist@example.com' },
    });
    getWaitlistAccessMock.mockResolvedValue({
      entryId: 'entry-1',
      status: 'waitlisted',
    });

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');

    await expect(StartPage()).rejects.toThrow('NEXT_REDIRECT:/waitlist');
    expect(getWaitlistAccessMock).toHaveBeenCalledExactlyOnceWith(
      'artist@example.com'
    );
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith('/waitlist');
  });

  it('does not render a pending receipt for a non-pending durable status', async () => {
    resolveUserStateMock.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
      context: { email: 'artist@example.com' },
    });
    getWaitlistAccessMock.mockResolvedValue({
      entryId: 'entry-1',
      status: 'approved',
    });

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    render(await StartPage());

    expect(screen.getByTestId('onboarding-shell')).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('renders the chat shell without minting an onboarding cookie', async () => {
    const { default: StartPage } = await import('@/app/(dynamic)/start/page');

    render(await StartPage());

    expect(screen.getByTestId('onboarding-shell')).toHaveAttribute(
      'data-session-label',
      'pending'
    );
    expect(getOrMintOnboardingSessionIdMock).not.toHaveBeenCalled();
    expect(resolveUserStateMock).toHaveBeenCalledWith({
      createDbUserIfMissing: false,
    });
  });

  it.each([
    CanonicalUserState.UNAUTHENTICATED,
    CanonicalUserState.NEEDS_DB_USER,
    CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
    CanonicalUserState.NEEDS_ONBOARDING,
  ])('keeps %s in the canonical /start chat', async state => {
    resolveUserStateMock.mockResolvedValue({
      state,
      context: { email: 'artist@example.com' },
    });

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    render(await StartPage());

    expect(screen.getByTestId('onboarding-shell')).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    [CanonicalUserState.ACTIVE, '/app'],
    [CanonicalUserState.BANNED, '/unavailable'],
    [CanonicalUserState.USER_CREATION_FAILED, '/error/user-creation-failed'],
  ])('redirects %s away from /start to %s', async (state, expected) => {
    resolveUserStateMock.mockResolvedValue({
      state,
      context: { email: 'artist@example.com' },
    });

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    await expect(StartPage()).rejects.toThrow(`NEXT_REDIRECT:${expected}`);
    expect(redirectMock).toHaveBeenCalledWith(expected);
  });
});
