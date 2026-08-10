import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileVisitTracking } from '@/components/organisms/hooks/useProfileTracking';

const { mutateMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
}));

vi.mock('@/lib/queries/useTrackingMutation', () => ({
  useTrackingMutation: vi.fn(() => ({
    mutate: mutateMock,
  })),
}));

describe('useProfileVisitTracking', () => {
  const originalCi = process.env.NEXT_PUBLIC_CI;

  beforeEach(() => {
    mutateMock.mockReset();
    Object.defineProperty(document, 'referrer', {
      value: 'https://example.com/source',
      configurable: true,
    });
    window.history.replaceState(
      null,
      '',
      '/dualipa?utm_source=ig&utm_medium=social'
    );
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CI = originalCi;
  });

  it('skips visit tracking in CI builds', async () => {
    process.env.NEXT_PUBLIC_CI = 'true';

    renderHook(() => useProfileVisitTracking('artist-123', 'token-123'));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });

  it('tracks profile visits outside CI builds', async () => {
    process.env.NEXT_PUBLIC_CI = 'false';

    renderHook(() => useProfileVisitTracking('artist-123', 'token-123'));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        profileId: 'artist-123',
        referrer: 'https://example.com/source',
        trackingToken: 'token-123',
        utmParams: {
          source: 'ig',
          medium: 'social',
        },
      });
    });
  });

  it('skips visit + visit-token calls for the demo profile (JOV-4932)', async () => {
    // Demo previews have no backing profile row — both audience endpoints
    // reject demo-profile with 400 and visits would pollute analytics.
    process.env.NEXT_PUBLIC_CI = 'false';
    const { DEMO_PROFILE_ID } = await import('@/lib/demo-personas');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useProfileVisitTracking(DEMO_PROFILE_ID));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
