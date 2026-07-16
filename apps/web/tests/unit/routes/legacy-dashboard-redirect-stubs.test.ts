import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('legacy dashboard redirect stubs', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('sends legacy dashboard root traffic to the canonical app dashboard', async () => {
    const { default: LegacyDashboardPage } = await import(
      '../../../app/app/(shell)/dashboard/page'
    );

    await LegacyDashboardPage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('sends legacy links traffic to the canonical profile panel', async () => {
    const { default: LinksPage } = await import(
      '../../../app/app/(shell)/dashboard/links/page'
    );

    LinksPage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.CHAT_PROFILE_PANEL);
  });

  it('sends legacy tipping traffic to the canonical artist pay settings', async () => {
    const { default: TippingRedirect } = await import(
      '../../../app/app/(shell)/dashboard/tipping/page'
    );

    TippingRedirect();

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );
  });
});
