import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

const {
  getOrMintOnboardingSessionIdMock,
  getWaitlistAccessMock,
  isWaitlistGateEnabledMock,
  redirectMock,
  resolveUserStateMock,
} = vi.hoisted(() => ({
  getOrMintOnboardingSessionIdMock: vi.fn(),
  getWaitlistAccessMock: vi.fn(),
  isWaitlistGateEnabledMock: vi.fn(),
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
  OnboardingShell: ({
    sessionLabel,
    starterHandoff,
  }: {
    readonly sessionLabel: string;
    readonly starterHandoff?: {
      readonly kind: string;
      readonly prompt: string;
      readonly artistName?: string;
      readonly spotifyUrl?: string;
    } | null;
  }) => (
    <div
      data-session-label={sessionLabel}
      data-starter-handoff={
        starterHandoff ? JSON.stringify(starterHandoff) : ''
      }
      data-testid='onboarding-shell'
    />
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

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: isWaitlistGateEnabledMock,
}));

describe('/start page', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getWaitlistAccessMock.mockReset();
    getWaitlistAccessMock.mockResolvedValue({ entryId: null, status: null });
    isWaitlistGateEnabledMock.mockReset();
    isWaitlistGateEnabledMock.mockResolvedValue(true);
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

  it('does not read waitlist when the launch gate is off (JOV-6449)', async () => {
    resolveUserStateMock.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
      context: { email: 'artist@example.com' },
    });
    isWaitlistGateEnabledMock.mockResolvedValue(false);
    getWaitlistAccessMock.mockRejectedValue(
      new Error('waitlist table unavailable')
    );

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');

    await expect(StartPage()).rejects.toThrow('NEXT_REDIRECT:/waitlist');
    expect(isWaitlistGateEnabledMock).toHaveBeenCalledOnce();
    expect(getWaitlistAccessMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith('/waitlist');
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

  it('hands an anonymous spotify_artist handoff to the onboarding shell (JOV-6034)', async () => {
    // The hero's search-select handoff lands on /start pre-auth; the funnel
    // must accept the params and forward the resolved handoff to the chat.
    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    render(
      await StartPage({
        searchParams: Promise.resolve({
          spotify_url: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
          artist_name: 'Taylor Swift',
          starter_prompt: "hey, I'm Taylor Swift. show me my Spotify.",
        }),
      })
    );

    const shell = screen.getByTestId('onboarding-shell');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(JSON.parse(shell.dataset.starterHandoff ?? '')).toEqual({
      kind: 'spotify_artist',
      prompt: "hey, I'm Taylor Swift. show me my Spotify.",
      spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
      artistName: 'Taylor Swift',
    });
  });

  it('hands a free-text prompt handoff to the onboarding shell', async () => {
    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    render(
      await StartPage({
        searchParams: Promise.resolve({
          starter_prompt: "hey, I'm Michael Jackson. show me my Spotify.",
        }),
      })
    );

    const shell = screen.getByTestId('onboarding-shell');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(JSON.parse(shell.dataset.starterHandoff ?? '')).toEqual({
      kind: 'prompt',
      prompt: "hey, I'm Michael Jackson. show me my Spotify.",
    });
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
