import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureErrorMock, selectMock } = vi.hoisted(() => ({
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  selectMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

describe('smart link static params', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    captureErrorMock.mockClear();
    selectMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('skips release static-param queries when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');

    const { getFeaturedSmartLinkStaticParams } = await import(
      '@/app/[username]/[slug]/_lib/data'
    );

    await expect(getFeaturedSmartLinkStaticParams()).resolves.toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('skips track static-param queries when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');

    const { getFeaturedTrackStaticParams } = await import(
      '@/app/[username]/[slug]/_lib/data'
    );

    await expect(getFeaturedTrackStaticParams()).resolves.toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('falls back when release static-param query fails', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test');
    selectMock.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    const { getFeaturedSmartLinkStaticParams } = await import(
      '@/app/[username]/[slug]/_lib/data'
    );

    await expect(getFeaturedSmartLinkStaticParams()).resolves.toEqual([]);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Failed to load smart-link static params',
      expect.any(Error),
      expect.objectContaining({
        helper: 'getFeaturedSmartLinkStaticParams',
        route: '/[username]/[slug]',
      })
    );
  });

  it('falls back when track static-param query fails', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test');
    selectMock.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    const { getFeaturedTrackStaticParams } = await import(
      '@/app/[username]/[slug]/_lib/data'
    );

    await expect(getFeaturedTrackStaticParams()).resolves.toEqual([]);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Failed to load track static params',
      expect.any(Error),
      expect.objectContaining({
        helper: 'getFeaturedTrackStaticParams',
        route: '/[username]/[slug]/[trackSlug]',
      })
    );
  });
});
