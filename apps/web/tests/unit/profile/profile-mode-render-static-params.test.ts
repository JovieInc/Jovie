import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_MODE_ALIAS_MARKER } from '@/lib/render-fixture-policy';

const { getProfilesByUsernamesMock, loggerErrorMock } = vi.hoisted(() => ({
  getProfilesByUsernamesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/lib/services/profile/queries', () => ({
  getProfilesByUsernames: (...args: unknown[]) =>
    getProfilesByUsernamesMock(...args),
  getTopProfilesForStaticGeneration: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
}));

const { getProfileModeRenderStaticParams } = await import(
  '@/app/[username]/_lib/profile-static-params'
);

describe('getProfileModeRenderStaticParams', () => {
  beforeEach(() => {
    getProfilesByUsernamesMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it('prerenders pay mode for the public unclaimed tipping profile', async () => {
    getProfilesByUsernamesMock.mockResolvedValue(
      new Map([['testartist', { isPublic: true, isClaimed: false }]])
    );

    await expect(getProfileModeRenderStaticParams()).resolves.toEqual([
      {
        username: 'testartist',
        profileMode: 'pay',
        marker: PROFILE_MODE_ALIAS_MARKER,
      },
    ]);
    expect(PROFILE_MODE_ALIAS_MARKER).toBe('__profile-mode-alias');
    expect(getProfilesByUsernamesMock).toHaveBeenCalledWith(['testartist']);
  });

  it('omits a missing or private tipping profile', async () => {
    getProfilesByUsernamesMock.mockResolvedValue(new Map());
    await expect(getProfileModeRenderStaticParams()).resolves.toEqual([]);

    getProfilesByUsernamesMock.mockResolvedValue(
      new Map([['testartist', { isPublic: false, isClaimed: false }]])
    );
    await expect(getProfileModeRenderStaticParams()).resolves.toEqual([]);
  });

  it('degrades a build-time lookup failure to an empty param list', async () => {
    getProfilesByUsernamesMock.mockRejectedValue(new Error('neon cold start'));

    await expect(getProfileModeRenderStaticParams()).resolves.toEqual([]);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to load profile mode render static params',
      expect.objectContaining({
        route: '/[username]/profile-mode-render/[profileMode]/[marker]',
      }),
      'public-profile'
    );
  });
});
