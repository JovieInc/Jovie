import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

describe('smart link static params', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
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
});
