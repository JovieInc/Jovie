import { describe, expect, it, vi } from 'vitest';

const { mockResolveUserState } = vi.hoisted(() => ({
  mockResolveUserState: vi.fn().mockResolvedValue({
    state: 'UNAUTHENTICATED',
    redirectTo: '/signin',
  }),
}));

// OnboardingShell is a UI component we don't need to render in this test.
vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: () => null,
}));

vi.mock('@/lib/auth/gate', () => ({
  resolveUserState: mockResolveUserState,
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
});
