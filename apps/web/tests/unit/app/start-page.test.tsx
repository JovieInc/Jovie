import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

const { getOrMintOnboardingSessionIdMock, redirectMock, resolveUserStateMock } =
  vi.hoisted(() => ({
    getOrMintOnboardingSessionIdMock: vi.fn(),
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
  resolveUserState: resolveUserStateMock,
}));

describe('/start page', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resolveUserStateMock.mockReset();
    resolveUserStateMock.mockResolvedValue({
      state: CanonicalUserState.UNAUTHENTICATED,
      redirectTo: '/signin',
    });
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
    [CanonicalUserState.WAITLIST_PENDING, '/waitlist'],
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
