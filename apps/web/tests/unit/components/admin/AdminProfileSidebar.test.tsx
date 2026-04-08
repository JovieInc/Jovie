import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminProfileSidebar } from '@/features/admin/admin-creator-profiles/AdminProfileSidebar';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { AlgorithmHealthReport } from '@/lib/spotify/scoring';
import type { Contact } from '@/types';

describe('AdminProfileSidebar', () => {
  const profile: AdminCreatorProfileRow = {
    id: 'profile-1',
    username: 'alice',
    usernameNormalized: 'alice',
    avatarUrl: null,
    displayName: 'Alice',
    bio: 'Indie pop artist',
    genres: ['Pop'],
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: true,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: 'user-1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    location: null,
    hometown: null,
    activeSinceYear: null,
    socialLinks: [
      {
        id: 'link-1',
        platform: 'instagram',
        platformType: 'instagram',
        url: 'https://instagram.com/alice',
        displayText: '@alice',
      },
      {
        id: 'link-spotify',
        platform: 'spotify',
        platformType: 'spotify',
        url: 'https://open.spotify.com/artist/1234567890123456789012',
        displayText: 'Spotify',
      },
    ],
  };

  const contact: Contact = {
    id: 'profile-1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    socialLinks: [
      {
        id: 'link-1',
        label: '@alice',
        platformType: 'instagram',
        url: 'https://instagram.com/alice',
      },
      {
        id: 'link-spotify',
        label: 'Spotify',
        platformType: 'spotify',
        url: 'https://open.spotify.com/artist/1234567890123456789012',
      },
    ],
  };

  function createTestQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  }

  function renderWithQueryClient(ui: ReactElement) {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders profile tabs and link list', () => {
    render(
      <AdminProfileSidebar
        profile={profile}
        contact={contact}
        isOpen
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('tab', { name: 'Social' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Algorithm' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument();
    expect(screen.getAllByText('@alice').length).toBeGreaterThan(0);
  });

  it('shows about tab content', async () => {
    const user = userEvent.setup();

    render(
      <AdminProfileSidebar
        profile={profile}
        contact={contact}
        isOpen
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByText('Indie pop artist')).toBeInTheDocument();
    expect(screen.getByText('Pop')).toBeInTheDocument();
  });

  it('loads algorithm analysis when the algorithm tab opens', async () => {
    const user = userEvent.setup();
    const readyReport: AlgorithmHealthReport = {
      targetArtist: {
        spotifyId: '1234567890123456789012',
        name: 'Alice',
        bio: null,
        imageUrl: null,
        genres: ['indie pop'],
        followerCount: 1200,
        popularity: 42,
        externalUrls: {},
      },
      status: 'ready',
      verdict: {
        label: 'Healthy',
        confidence: 'High',
        headline: 'Spotify places this creator near stronger adjacent artists.',
        detail: '1 of 1 compared artists are bigger than the target.',
      },
      nextActions: [
        'Use these stronger neighbours as playlist, collab, and audience targeting references.',
      ],
      checkedAt: '2026-04-08T03:22:14.406Z',
      attemptedNeighbourCount: 1,
      resolvedNeighbourCount: 1,
      warnings: [],
      neighbours: [
        {
          artist: {
            spotifyId: 'neighbour-1',
            name: 'Bigger Artist',
            bio: null,
            imageUrl: null,
            genres: ['indie pop'],
            followerCount: 5000,
            popularity: 58,
            externalUrls: {},
          },
          size: 'BIGGER',
          popularityDelta: 16,
          followerDelta: 3800,
          genreOverlap: 1,
          authenticity: { level: 'CLEAN', reasons: [] },
        },
      ],
      summary: {
        bigger: 1,
        similar: 0,
        smaller: 0,
        total: 1,
      },
      healthScore: 100,
    };
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(readyReport), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderWithQueryClient(
      <AdminProfileSidebar
        profile={profile}
        contact={contact}
        isOpen
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Algorithm' }));

    expect(
      await screen.findByTestId('admin-profile-algorithm-panel')
    ).toBeInTheDocument();
    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/spotify/fal-analysis?artistId=1234567890123456789012',
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('shows a no-link empty state when no Spotify artist link exists', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, 'fetch');
    const noSpotifyProfile = {
      ...profile,
      socialLinks: profile.socialLinks?.filter(
        link => link.platform !== 'spotify'
      ),
    };
    const noSpotifyContact = {
      ...contact,
      socialLinks: contact.socialLinks.filter(
        link => link.platformType !== 'spotify'
      ),
    };

    renderWithQueryClient(
      <AdminProfileSidebar
        profile={noSpotifyProfile}
        contact={noSpotifyContact}
        isOpen
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Algorithm' }));

    expect(await screen.findByText('No Spotify Link')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows unavailable without rendering a zero percent score', async () => {
    const user = userEvent.setup();
    const unavailableReport: AlgorithmHealthReport = {
      targetArtist: {
        spotifyId: '1234567890123456789012',
        name: 'Alice',
        bio: null,
        imageUrl: null,
        genres: ['indie pop'],
        followerCount: 1200,
        popularity: 42,
        externalUrls: {},
      },
      status: 'unavailable',
      verdict: {
        label: 'Unavailable',
        confidence: 'Low',
        headline: 'Algorithm health is temporarily unavailable.',
        detail: 'Spotify showed an error page instead of related artists.',
      },
      nextActions: [
        'Retry later because Spotify did not expose a usable related-artists source this time.',
      ],
      checkedAt: '2026-04-08T03:22:14.406Z',
      attemptedNeighbourCount: 0,
      resolvedNeighbourCount: 0,
      warnings: ['Spotify rendered a Page not available response.'],
      neighbours: [],
      summary: {
        bigger: 0,
        similar: 0,
        smaller: 0,
        total: 0,
      },
    };
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(unavailableReport), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderWithQueryClient(
      <AdminProfileSidebar
        profile={profile}
        contact={contact}
        isOpen
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Algorithm' }));

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
