import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('settings focused routes', () => {
  it('redirects the legacy appearance route to the canonical account route', async () => {
    const { default: SettingsAppearancePage } = await import(
      '@/app/app/(shell)/settings/appearance/page'
    );

    expect(() => SettingsAppearancePage()).toThrow(
      `REDIRECT:${APP_ROUTES.SETTINGS_ACCOUNT}`
    );

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_ACCOUNT);
  });

  it('redirects the legacy notifications route to the canonical account route', async () => {
    const { default: SettingsNotificationsPage } = await import(
      '@/app/app/(shell)/settings/notifications/page'
    );

    expect(() => SettingsNotificationsPage()).toThrow(
      `REDIRECT:${APP_ROUTES.SETTINGS_ACCOUNT}`
    );

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_ACCOUNT);
  });

  it('redirects the legacy delete-account route to data privacy', async () => {
    const { default: SettingsDeleteAccountPage } = await import(
      '@/app/app/(shell)/settings/delete-account/page'
    );

    expect(() => SettingsDeleteAccountPage()).toThrow(
      `REDIRECT:${APP_ROUTES.SETTINGS_DATA_PRIVACY}`
    );

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_DATA_PRIVACY);
  });
});
