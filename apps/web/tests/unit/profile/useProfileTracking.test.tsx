import { renderHook, waitFor } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Shared workers may have evaluated these modules with another file's mocks.
vi.hoisted(() => vi.resetModules());
// Do not leave this file's mocked dependency graph cached for the next file.
afterAll(() => vi.resetModules());

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
  const originalReferrer = Object.getOwnPropertyDescriptor(
    document,
    'referrer'
  );

  beforeEach(() => {
    mutateMock.mockReset();
    // The hook reads globalThis.location.search. Own the parsed campaign URL
    // even when a sibling file replaced jsdom's live location with a shim.
    vi.stubGlobal(
      'location',
      new URL('https://example.com/dualipa?utm_source=ig&utm_medium=social')
    );
    Object.defineProperty(document, 'referrer', {
      value: 'https://example.com/source',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (originalReferrer) {
      Object.defineProperty(document, 'referrer', originalReferrer);
    } else {
      Reflect.deleteProperty(document, 'referrer');
    }
  });

  it('skips visit tracking in CI builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_CI', 'true');

    renderHook(() => useProfileVisitTracking('artist-123', 'token-123'));

    await waitFor(() => {
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });

  it('tracks profile visits outside CI builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_CI', 'false');

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
    vi.stubEnv('NEXT_PUBLIC_CI', 'false');
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
