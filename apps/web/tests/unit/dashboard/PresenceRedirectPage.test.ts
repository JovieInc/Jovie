import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { getAppFlagValueMock, redirectMock } = vi.hoisted(() => ({
  getAppFlagValueMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

describe('presence redirect routes', () => {
  afterEach(() => {
    redirectMock.mockClear();
    getAppFlagValueMock.mockReset();
  });

  it('redirects the canonical presence route to the unified profiles workspace', async () => {
    getAppFlagValueMock.mockResolvedValue(true);
    const { default: PresencePage } = await import(
      '../../../app/app/(shell)/presence/page'
    );

    await PresencePage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.PROFILES);
  });

  it('redirects the legacy dashboard presence route to the same destination', async () => {
    getAppFlagValueMock.mockResolvedValue(true);
    const { default: LegacyPresencePage } = await import(
      '../../../app/app/(shell)/dashboard/presence/page'
    );

    await LegacyPresencePage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.PROFILES);
  });

  it('keeps both legacy routes on the ungated settings fallback', async () => {
    getAppFlagValueMock.mockResolvedValue(false);
    const [{ default: PresencePage }, { default: LegacyPresencePage }] =
      await Promise.all([
        import('../../../app/app/(shell)/presence/page'),
        import('../../../app/app/(shell)/dashboard/presence/page'),
      ]);

    await PresencePage();
    await LegacyPresencePage();

    expect(redirectMock).toHaveBeenNthCalledWith(
      1,
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`
    );
    expect(redirectMock).toHaveBeenNthCalledWith(
      2,
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`
    );
  });
});
