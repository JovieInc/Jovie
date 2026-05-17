import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('settings page aliases', () => {
  it('redirects the settings root to the canonical account settings page', async () => {
    const { default: SettingsPage } = await import(
      '../../../app/app/(shell)/settings/page'
    );

    SettingsPage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_ACCOUNT);
  });
});
