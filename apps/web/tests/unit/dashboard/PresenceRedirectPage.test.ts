import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('presence redirect routes', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('redirects the canonical presence route to artist profile music settings', async () => {
    const { default: PresencePage } = await import(
      '../../../app/app/(shell)/presence/page'
    );

    PresencePage();

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`
    );
  });

  it('redirects the legacy dashboard presence route to the same destination', async () => {
    const { default: LegacyPresencePage } = await import(
      '../../../app/app/(shell)/dashboard/presence/page'
    );

    LegacyPresencePage();

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`
    );
  });
});
