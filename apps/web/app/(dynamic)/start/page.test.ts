import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveUserState: vi.fn().mockResolvedValue({
    state: 'UNAUTHENTICATED',
    redirectTo: '/signin',
  }),
  getWaitlistAccess: vi.fn(),
  isWaitlistGateEnabled: vi.fn(),
  getSession: vi.fn(),
  resolveSyntheticPassage: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock('@/lib/synthetic/passage.server', () => ({
  resolveSyntheticPassage: mocks.resolveSyntheticPassage,
}));

// OnboardingShell is a UI component we don't need to render in this test.
vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: () => null,
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

vi.mock('@/lib/auth/gate', async () => ({
  ...(await vi.importActual('@/lib/auth/canonical-user-state')),
  resolveUserState: mocks.resolveUserState,
  getWaitlistAccess: mocks.getWaitlistAccess,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mocks.isWaitlistGateEnabled,
}));

import StartPage from './page';

describe('StartPage', () => {
  it('renders the onboarding shell without minting a server-component cookie', async () => {
    const result = await StartPage({ searchParams: Promise.resolve({}) });

    expect(result).toMatchObject({
      props: {
        sessionLabel: 'pending',
      },
    });
  });

  it('passes signed-in state into the chat shell after OTP', async () => {
    mocks.resolveUserState.mockResolvedValueOnce({
      state: 'NEEDS_ONBOARDING',
      context: { email: 'test@example.com' },
    });

    const result = await StartPage({ searchParams: Promise.resolve({}) });

    expect(result.props.isSignedIn).toBe(true);
  });

  it('passes homepage intent and a validated starter handoff into the shell', async () => {
    const result = await StartPage({
      searchParams: Promise.resolve({
        intent_id: 'intent-1',
        artist_name: 'David Guetta',
        spotify_url: 'https://open.spotify.com/artist/1Cs0zKBU1kc0i8ypK3B9ai',
        starter_prompt: "hey, I'm David Guetta. show me my Spotify.",
      }),
    });

    expect(result).toMatchObject({
      props: {
        intentId: 'intent-1',
        sessionLabel: 'pending',
        starterHandoff: {
          artistName: 'David Guetta',
          kind: 'spotify_artist',
          prompt: "hey, I'm David Guetta. show me my Spotify.",
          spotifyUrl: 'https://open.spotify.com/artist/1Cs0zKBU1kc0i8ypK3B9ai',
        },
      },
    });
  });

  it('does not let bare URL params suppress the blank entry state', async () => {
    const result = await StartPage({
      searchParams: Promise.resolve({
        spotify_url: 'https://open.spotify.com/artist/1Cs0zKBU1kc0i8ypK3B9ai',
        url: 'https://example.com/artist',
      }),
    });

    expect(result).toMatchObject({
      props: {
        sessionLabel: 'pending',
        starterHandoff: null,
      },
    });
  });

  it('redirects a pending account to the canonical receipt when the waitlist read fails', async () => {
    mocks.resolveUserState.mockResolvedValueOnce({
      state: 'WAITLIST_PENDING',
      context: { email: 'pending@example.com' },
    });
    mocks.isWaitlistGateEnabled.mockResolvedValueOnce(true);
    mocks.getWaitlistAccess.mockRejectedValueOnce(new Error('db down'));

    await expect(
      StartPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('redirect:/waitlist');
  });

  it('does not 500 when the waitlist gate check itself fails', async () => {
    mocks.resolveUserState.mockResolvedValueOnce({
      state: 'WAITLIST_PENDING',
      context: { email: 'pending@example.com' },
    });
    mocks.isWaitlistGateEnabled.mockRejectedValueOnce(new Error('db down'));

    await expect(
      StartPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('redirect:/waitlist');
  });

  describe('synthetic principal test sitekey (JOV-7697)', () => {
    it('keeps anonymous visitors on the production widget without a session read', async () => {
      mocks.getSession.mockClear();
      const result = await StartPage({ searchParams: Promise.resolve({}) });

      expect(result.props.turnstileTestMode).toBe(false);
      expect(mocks.getSession).not.toHaveBeenCalled();
    });

    it('keeps a signed-in account without passage on the production widget', async () => {
      mocks.resolveUserState.mockResolvedValueOnce({
        state: 'NEEDS_ONBOARDING',
        context: { email: 'artist@band.com' },
      });
      mocks.getSession.mockResolvedValueOnce({ user: { id: 'u1' } });
      mocks.resolveSyntheticPassage.mockResolvedValueOnce(null);

      const result = await StartPage({ searchParams: Promise.resolve({}) });

      expect(result.props.turnstileTestMode).toBe(false);
    });

    it('mounts the test sitekey for a server-approved synthetic principal', async () => {
      mocks.resolveUserState.mockResolvedValueOnce({
        state: 'NEEDS_ONBOARDING',
        context: { email: 'signup+synthetic-grokbot@canary.example' },
      });
      const session = { user: { id: 'u2' } };
      mocks.getSession.mockResolvedValueOnce(session);
      mocks.resolveSyntheticPassage.mockResolvedValueOnce({
        actorId: 'grokbot',
      });

      const result = await StartPage({ searchParams: Promise.resolve({}) });

      expect(mocks.resolveSyntheticPassage).toHaveBeenCalledWith(
        session,
        'onboarding_chat'
      );
      expect(result.props.turnstileTestMode).toBe(true);
    });

    it('falls back to the production widget when the passage check throws', async () => {
      mocks.resolveUserState.mockResolvedValueOnce({
        state: 'NEEDS_ONBOARDING',
        context: { email: 'signup+synthetic-grokbot@canary.example' },
      });
      mocks.getSession.mockRejectedValueOnce(new Error('db down'));

      const result = await StartPage({ searchParams: Promise.resolve({}) });

      expect(result.props.turnstileTestMode).toBe(false);
    });
  });
});
