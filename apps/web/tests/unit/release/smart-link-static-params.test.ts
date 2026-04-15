import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerErrorMock, selectMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

describe('smart link static params', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    loggerErrorMock.mockClear();
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
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to load smart-link static params',
      expect.objectContaining({
        error: expect.any(Error),
        helper: 'getFeaturedSmartLinkStaticParams',
        route: '/[username]/[slug]',
      }),
      'public-smart-link'
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
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to load track static params',
      expect.objectContaining({
        error: expect.any(Error),
        helper: 'getFeaturedTrackStaticParams',
        route: '/[username]/[slug]/[trackSlug]',
      }),
      'public-smart-link'
    );
  });
});
