import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCaptureDismissalStatus,
  invalidateCaptureDismissalStatus,
} from './capture-dismissal-client';

// Regression: ISSUE-001 — PAC card and inline notifications CTA each fired
// their own GET /api/profile/capture-dismissal on page load, doubling the
// request (and the server-side session counter) per view.
// Found by /qa on 2026-07-20
// Report: .gstack/qa-reports/qa-report-localhost-3101-2026-07-20.md

const ARTIST_ID = '8473a72f-51a0-4ce0-8739-4facfd89a7a5';

function mockFetchOnce(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

describe('getCaptureDismissalStatus', () => {
  beforeEach(() => {
    invalidateCaptureDismissalStatus(ARTIST_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dedupes concurrent calls into one fetch per artist', async () => {
    const fetchMock = mockFetchOnce({ suppressed: false });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([
      getCaptureDismissalStatus(ARTIST_ID),
      getCaptureDismissalStatus(ARTIST_ID),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/profile/capture-dismissal?artist_id=${ARTIST_ID}`,
      { credentials: 'same-origin' }
    );
    expect(a).toEqual({ suppressed: false });
    expect(b).toBe(a);
  });

  it('serves repeat sequential calls from cache', async () => {
    const fetchMock = mockFetchOnce({ suppressed: true });
    vi.stubGlobal('fetch', fetchMock);

    await getCaptureDismissalStatus(ARTIST_ID);
    const again = await getCaptureDismissalStatus(ARTIST_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ suppressed: true });
  });

  it('refetches after invalidation', async () => {
    const fetchMock = mockFetchOnce({ suppressed: true });
    vi.stubGlobal('fetch', fetchMock);

    await getCaptureDismissalStatus(ARTIST_ID);
    invalidateCaptureDismissalStatus(ARTIST_ID);
    await getCaptureDismissalStatus(ARTIST_ID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves null on non-OK responses without rejecting', async () => {
    const fetchMock = mockFetchOnce(null, false);
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCaptureDismissalStatus(ARTIST_ID)).resolves.toBeNull();
  });

  it('resolves null on network failure without rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(getCaptureDismissalStatus(ARTIST_ID)).resolves.toBeNull();
  });
});
