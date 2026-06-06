import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExpandedTracks } from '@/features/dashboard/organisms/release-provider-matrix/hooks/useExpandedTracks';
import type { ReleaseViewModel, TrackViewModel } from '@/lib/discography/types';
import { createMockRelease } from '@/tests/test-utils/factories';

const { captureErrorMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

function makeRelease(): ReleaseViewModel {
  return createMockRelease({
    id: 'release_1',
    title: 'Expanded Release',
  });
}

function makeTrack(): TrackViewModel {
  return {
    id: 'track_1',
    releaseId: 'release_1',
    releaseSlug: 'expanded-release',
    title: 'Seeded Track',
    slug: 'seeded-track',
    smartLinkPath: '/demo/expanded-release/tracks/1',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 180_000,
    isrc: 'USRC10000001',
    isExplicit: false,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [],
  };
}

describe('useExpandedTracks', () => {
  beforeEach(() => {
    captureErrorMock.mockReset();
    fetchWithTimeoutMock.mockReset();
  });

  it('expands seeded demo tracks without calling the live tracks API', async () => {
    const release = makeRelease();
    const track = makeTrack();
    const { result } = renderHook(() =>
      useExpandedTracks({ [release.id]: [track] })
    );

    await act(async () => {
      await result.current.toggleExpansion(release);
    });

    expect(result.current.isExpanded(release.id)).toBe(true);
    expect(result.current.getTracksForRelease(release.id)).toEqual([track]);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it('renders a visible empty track fallback when the live tracks API fails', async () => {
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error('offline'));
    const release = makeRelease();
    const { result } = renderHook(() => useExpandedTracks());

    await act(async () => {
      await result.current.toggleExpansion(release);
    });

    expect(result.current.isExpanded(release.id)).toBe(true);
    expect(result.current.getTracksForRelease(release.id)).toEqual([]);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Failed to load tracks for release',
      expect.any(Error),
      expect.objectContaining({ releaseId: release.id })
    );
  });
});
