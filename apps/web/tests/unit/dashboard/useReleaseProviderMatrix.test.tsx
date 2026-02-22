import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';

/**
 * useReleaseProviderMatrix Hook Tests
 *
 * Tests callback referential stability (catches re-render loops caused by
 * unstable dependencies), state management, and mutation forwarding.
 */

// ── Stable mock mutation factories ──

const stableMutate = vi.fn();
const stableReset = vi.fn();
const stableSync = vi.fn();
const stableRefresh = vi.fn();
const stableRescan = vi.fn();
const stableSaveLyricsAsync = vi.fn();
const stableFormatLyricsAsync = vi.fn();

function makeMockMutation(mutateFn: ReturnType<typeof vi.fn>) {
  return {
    mutate: mutateFn,
    mutateAsync: vi.fn(),
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    reset: vi.fn(),
    status: 'idle' as const,
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    context: undefined,
  };
}

vi.mock('@/lib/queries', () => ({
  useSaveProviderOverrideMutation: () => makeMockMutation(stableMutate),
  useResetProviderOverrideMutation: () => makeMockMutation(stableReset),
  useSyncReleasesFromSpotifyMutation: () => makeMockMutation(stableSync),
  useRefreshReleaseMutation: () => makeMockMutation(stableRefresh),
  useRescanIsrcLinksMutation: () => makeMockMutation(stableRescan),
  useSaveReleaseLyricsMutation: () => ({
    ...makeMockMutation(vi.fn()),
    mutateAsync: stableSaveLyricsAsync,
  }),
  useFormatReleaseLyricsMutation: () => ({
    ...makeMockMutation(vi.fn()),
    mutateAsync: stableFormatLyricsAsync,
  }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://test.jovie.com',
}));

// ── Import after mocks ──
const { useReleaseProviderMatrix } = await import(
  '@/components/dashboard/organisms/release-provider-matrix/useReleaseProviderMatrix'
);

// ── Test data ──

interface ReleaseOverrides {
  id: string;
  profileId: string;
  title: string;
}

interface ProviderConfigEntry {
  label: string;
  accent: string;
}

function makeRelease(overrides?: Partial<ReleaseOverrides>) {
  return {
    id: overrides?.id ?? 'release-1',
    profileId: overrides?.profileId ?? 'profile-1',
    title: overrides?.title ?? 'Test Release',
    slug: 'test-release',
    smartLinkPath: '/r/test-release',
    releaseType: 'single' as const,
    totalTracks: 1,
    providers: [
      {
        key: 'spotify' as const,
        url: 'https://open.spotify.com/album/abc',
        source: 'ingested' as const,
        updatedAt: '2024-01-01',
        label: 'Spotify',
        path: '/spotify',
        isPrimary: true,
      },
      {
        key: 'apple_music' as const,
        url: 'https://music.apple.com/album/abc',
        source: 'ingested' as const,
        updatedAt: '2024-01-01',
        label: 'Apple Music',
        path: '/apple-music',
        isPrimary: true,
      },
    ],
  };
}

const defaultProps = {
  releases: [makeRelease()],
  providerConfig: {
    spotify: { label: 'Spotify', accent: '#1DB954' },
    apple_music: { label: 'Apple Music', accent: '#FA243C' },
    youtube: { label: 'YouTube', accent: '#FF0000' },
    soundcloud: { label: 'SoundCloud', accent: '#FF5500' },
    deezer: { label: 'Deezer', accent: '#FEAA2D' },
    tidal: { label: 'Tidal', accent: '#000000' },
    amazon_music: { label: 'Amazon Music', accent: '#25D1DA' },
    pandora: { label: 'Pandora', accent: '#224099' },
    audiomack: { label: 'Audiomack', accent: '#FFA500' },
    tiktok: { label: 'TikTok', accent: '#000000' },
    bandcamp: { label: 'Bandcamp', accent: '#629AA9' },
    beatport: { label: 'Beatport', accent: '#94D500' },
    napster: { label: 'Napster', accent: '#0078FF' },
    qobuz: { label: 'Qobuz', accent: '#0070EF' },
    anghami: { label: 'Anghami', accent: '#8B00FF' },
    boomplay: { label: 'Boomplay', accent: '#FF6600' },
    iheartradio: { label: 'iHeartRadio', accent: '#C6002B' },
  } as Record<ProviderKey, ProviderConfigEntry>,
  primaryProviders: ['spotify', 'apple_music'] as ProviderKey[],
};

describe('useReleaseProviderMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callback referential stability', () => {
    it('handleAddUrl maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.handleAddUrl;
      rerender();
      expect(result.current.handleAddUrl).toBe(first);
    });

    it('handleSync maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.handleSync;
      rerender();
      expect(result.current.handleSync).toBe(first);
    });

    it('handleRefreshRelease maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.handleRefreshRelease;
      rerender();
      expect(result.current.handleRefreshRelease).toBe(first);
    });

    it('handleRescanIsrc maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.handleRescanIsrc;
      rerender();
      expect(result.current.handleRescanIsrc).toBe(first);
    });

    it('openEditor maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.openEditor;
      rerender();
      expect(result.current.openEditor).toBe(first);
    });

    it('closeEditor maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.closeEditor;
      rerender();
      expect(result.current.closeEditor).toBe(first);
    });

    it('handleCopy maintains identity across re-renders', () => {
      const { result, rerender } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      const first = result.current.handleCopy;
      rerender();
      expect(result.current.handleCopy).toBe(first);
    });
  });

  describe('state management', () => {
    it('initializes rows from releases prop', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      expect(result.current.rows).toHaveLength(1);
      expect(result.current.rows[0].id).toBe('release-1');
    });

    it('openEditor sets editingRelease and populates drafts', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      expect(result.current.editingRelease).toBeNull();

      act(() => {
        result.current.openEditor(defaultProps.releases[0]);
      });

      expect(result.current.editingRelease).toEqual(defaultProps.releases[0]);
      expect(result.current.drafts).toEqual({
        spotify: 'https://open.spotify.com/album/abc',
        apple_music: 'https://music.apple.com/album/abc',
      });
    });

    it('closeEditor clears editingRelease and drafts', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.openEditor(defaultProps.releases[0]);
      });
      expect(result.current.editingRelease).not.toBeNull();

      act(() => {
        result.current.closeEditor();
      });

      expect(result.current.editingRelease).toBeNull();
      expect(result.current.drafts).toEqual({});
    });

    it('computes providerList from config and primaryProviders', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      const spotify = result.current.providerList.find(
        p => p.key === 'spotify'
      );
      expect(spotify).toEqual({
        key: 'spotify',
        label: 'Spotify',
        accent: '#1DB954',
        isPrimary: true,
      });
    });

    it('computes totalReleases and totalOverrides', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );
      expect(result.current.totalReleases).toBe(1);
      expect(result.current.totalOverrides).toBe(0);
    });
  });

  describe('mutations', () => {
    it('handleAddUrl calls saveProviderMutation.mutate with correct args', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.handleAddUrl(
          'release-1',
          'spotify',
          'https://open.spotify.com/album/new'
        );
      });

      expect(stableMutate).toHaveBeenCalledWith(
        {
          profileId: 'profile-1',
          releaseId: 'release-1',
          provider: 'spotify',
          url: 'https://open.spotify.com/album/new',
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('handleSync calls syncMutation.mutate', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.handleSync();
      });

      expect(stableSync).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('handleRefreshRelease calls refreshReleaseMutation.mutate', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.handleRefreshRelease('release-1');
      });

      expect(stableRefresh).toHaveBeenCalledWith(
        { releaseId: 'release-1' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('tracks refreshing state during refresh lifecycle', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.handleRefreshRelease('release-1');
      });

      expect(result.current.refreshingReleaseId).toBe('release-1');

      const options = stableRefresh.mock.calls[0]?.[1];
      expect(options).toBeDefined();

      act(() => {
        options?.onSettled?.();
      });

      expect(result.current.refreshingReleaseId).toBeNull();
    });

    it('sets flashed release id after refresh success', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.handleRefreshRelease('release-1');
      });

      const options = stableRefresh.mock.calls[0]?.[1];

      act(() => {
        options?.onSuccess?.(makeRelease({ id: 'release-1' }));
      });

      expect(result.current.flashedReleaseId).toBe('release-1');

      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(result.current.flashedReleaseId).toBeNull();
      vi.useRealTimers();
    });

    it('handleRescanIsrc calls rescanIsrcMutation.mutate', () => {
      const { result } = renderHook(() =>
        useReleaseProviderMatrix(defaultProps)
      );

      act(() => {
        result.current.handleRescanIsrc('release-1');
      });

      expect(stableRescan).toHaveBeenCalledWith(
        { releaseId: 'release-1' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });
  });
});
