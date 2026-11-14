import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findRedirectByOldSlug: vi.fn(),
  getTrackBySlugInRelease: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/discography/slug', () => ({
  findRedirectByOldSlug: h.findRedirectByOldSlug,
}));
vi.mock('./data', () => ({
  getTrackBySlugInRelease: h.getTrackBySlugInRelease,
}));

import { resolveMovedTrackPath } from './moved-track-path';

const base = { creatorId: 'c1', handle: 'tim' };

describe('resolveMovedTrackPath', () => {
  beforeEach(() => {
    h.findRedirectByOldSlug.mockReset();
    h.getTrackBySlugInRelease.mockReset();
  });

  it('follows a renamed release to the same track', async () => {
    h.findRedirectByOldSlug.mockResolvedValue({
      type: 'release',
      currentSlug: 'take-me-over',
    });
    await expect(
      resolveMovedTrackPath({
        ...base,
        releaseSlug: 'take-me-over-2',
        trackSlug: 'take-me-over-3',
        releaseId: null,
      })
    ).resolves.toBe('/tim/take-me-over/take-me-over-3');
    expect(h.findRedirectByOldSlug).toHaveBeenCalledWith(
      'c1',
      'take-me-over-2'
    );
  });

  it('drops a legacy numeric suffix when the plain track exists in the release', async () => {
    h.getTrackBySlugInRelease.mockResolvedValue({ title: 'Sober' });
    await expect(
      resolveMovedTrackPath({
        ...base,
        releaseSlug: 'sober',
        trackSlug: 'sober-2',
        releaseId: 'rel-sober',
      })
    ).resolves.toBe('/tim/sober/sober');
    expect(h.getTrackBySlugInRelease).toHaveBeenCalledWith(
      'rel-sober',
      'sober'
    );
  });

  it('returns null for an unknown track or release', async () => {
    h.findRedirectByOldSlug.mockResolvedValue(null);
    h.getTrackBySlugInRelease.mockResolvedValue(null);
    await expect(
      resolveMovedTrackPath({
        ...base,
        releaseSlug: 'nope',
        trackSlug: 'x',
        releaseId: null,
      })
    ).resolves.toBeNull();
    await expect(
      resolveMovedTrackPath({
        ...base,
        releaseSlug: 'sober',
        trackSlug: 'missing-2',
        releaseId: 'rel-sober',
      })
    ).resolves.toBeNull();
    await expect(
      resolveMovedTrackPath({
        ...base,
        releaseSlug: 'sober',
        trackSlug: 'plain',
        releaseId: 'rel-sober',
      })
    ).resolves.toBeNull();
    expect(h.getTrackBySlugInRelease).toHaveBeenCalledTimes(1);
  });
});
