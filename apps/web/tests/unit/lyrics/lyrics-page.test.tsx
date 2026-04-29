import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getAppFlagValue: vi.fn(),
  getDashboardShellData: vi.fn(),
  loadLyricsRouteTrack: vi.fn(),
  lyricsPageClient: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mocks.getAppFlagValue,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: ({ message }: { readonly message: string }) => (
    <div>{message}</div>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardShellData: mocks.getDashboardShellData,
}));

vi.mock('@/app/app/(shell)/lyrics/[trackId]/lyrics-data', () => ({
  loadLyricsRouteTrack: mocks.loadLyricsRouteTrack,
}));

vi.mock('@/app/app/(shell)/lyrics/[trackId]/LyricsPageClient', () => ({
  LyricsPageClient: mocks.lyricsPageClient,
}));

const { default: LyricsPage } = await import(
  '@/app/app/(shell)/lyrics/[trackId]/page'
);

const selectedProfile = {
  id: 'profile-1',
  displayName: 'Bahamas',
  username: 'bahamas',
  usernameNormalized: 'bahamas',
};

function routeParams(trackId = 'track-1') {
  return {
    params: Promise.resolve({ trackId }),
  };
}

describe('LyricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getAppFlagValue.mockResolvedValue(true);
    mocks.getDashboardShellData.mockResolvedValue({
      dashboardLoadError: null,
      needsOnboarding: false,
      selectedProfile,
    });
    mocks.lyricsPageClient.mockImplementation(
      ({
        initialTrack,
      }: {
        readonly initialTrack: { readonly title: string };
      }) => <div data-testid='lyrics-page'>{initialTrack.title}</div>
    );
  });

  it('404s inaccessible or wrong-profile track IDs instead of rendering an empty route', async () => {
    mocks.loadLyricsRouteTrack.mockResolvedValue(null);

    await expect(LyricsPage(routeParams())).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.loadLyricsRouteTrack).toHaveBeenCalledWith({
      profileId: 'profile-1',
      trackId: 'track-1',
      fallbackArtist: 'Bahamas',
    });
    expect(mocks.lyricsPageClient).not.toHaveBeenCalled();
  });

  it('renders the production empty lyrics state for a real track with no lyrics', async () => {
    mocks.loadLyricsRouteTrack.mockResolvedValue({
      title: 'Real Track',
      artist: 'Bahamas',
      lyrics: null,
    });

    render(await LyricsPage(routeParams()));

    expect(screen.getByTestId('lyrics-page')).toHaveTextContent('Real Track');
    expect(mocks.lyricsPageClient).toHaveBeenCalledWith(
      {
        initialLines: [],
        initialTrack: {
          title: 'Real Track',
          artist: 'Bahamas',
        },
        trackId: 'track-1',
      },
      undefined
    );
  });
});
