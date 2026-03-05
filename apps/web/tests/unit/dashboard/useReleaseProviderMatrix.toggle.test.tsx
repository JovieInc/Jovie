import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Tests for the openEditor toggle behavior:
 * clicking the same release again should close the editor (toggle pattern).
 */

const stableMutate = vi.fn();

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
  useResetProviderOverrideMutation: () => makeMockMutation(vi.fn()),
  useSyncReleasesFromSpotifyMutation: () => makeMockMutation(vi.fn()),
  useRefreshReleaseMutation: () => makeMockMutation(vi.fn()),
  useRescanIsrcLinksMutation: () => makeMockMutation(vi.fn()),
  useSaveCanvasStatusMutation: () => ({
    ...makeMockMutation(vi.fn()),
    mutateAsync: vi.fn(),
  }),
  useSaveReleaseLyricsMutation: () => ({
    ...makeMockMutation(vi.fn()),
    mutateAsync: vi.fn(),
  }),
  useFormatReleaseLyricsMutation: () => ({
    ...makeMockMutation(vi.fn()),
    mutateAsync: vi.fn(),
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
  getBaseUrl: () => 'https://test.jov.ie',
}));

const { useReleaseProviderMatrix } = await import(
  '@/components/dashboard/organisms/release-provider-matrix/useReleaseProviderMatrix'
);

function makeRelease(id = 'release-1') {
  return {
    id,
    profileId: 'profile-1',
    title: 'Test Release',
    slug: 'test-release',
    smartLinkPath: '/r/test-release',
    releaseType: 'single' as const,
    isExplicit: false,
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
    ],
  };
}

const defaultProps = {
  releases: [makeRelease(), makeRelease('release-2')],
  providerConfig: {
    spotify: { label: 'Spotify', accent: '#1DB954' },
  } as Record<string, { label: string; accent: string }>,
  primaryProviders: ['spotify' as const],
};

describe('openEditor toggle behavior', () => {
  it('clicking the same release toggles the editor closed', () => {
    const { result } = renderHook(() => useReleaseProviderMatrix(defaultProps));

    const release = defaultProps.releases[0];

    // Open
    act(() => {
      result.current.openEditor(release);
    });
    expect(result.current.editingRelease).toEqual(release);

    // Toggle close by clicking same release
    act(() => {
      result.current.openEditor(release);
    });
    expect(result.current.editingRelease).toBeNull();
    expect(result.current.drafts).toEqual({});
  });

  it('clicking a different release switches the editor', () => {
    const { result } = renderHook(() => useReleaseProviderMatrix(defaultProps));

    const [release1, release2] = defaultProps.releases;

    act(() => {
      result.current.openEditor(release1);
    });
    expect(result.current.editingRelease?.id).toBe('release-1');

    act(() => {
      result.current.openEditor(release2);
    });
    expect(result.current.editingRelease?.id).toBe('release-2');
  });

  it('toggle close then reopen works', () => {
    const { result } = renderHook(() => useReleaseProviderMatrix(defaultProps));

    const release = defaultProps.releases[0];

    // Open → close → reopen
    act(() => result.current.openEditor(release));
    expect(result.current.editingRelease).toEqual(release);

    act(() => result.current.openEditor(release));
    expect(result.current.editingRelease).toBeNull();

    act(() => result.current.openEditor(release));
    expect(result.current.editingRelease).toEqual(release);
  });
});
