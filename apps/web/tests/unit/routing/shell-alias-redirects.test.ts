import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

type RedirectRule = {
  readonly source: string;
};

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import ContactPage from '@/app/app/(shell)/contact/page';
import CanonicalContactsPage from '@/app/app/(shell)/contacts/page';
import DashboardContactsPage from '@/app/app/(shell)/dashboard/contacts/page';
import DashboardTourDatesPage from '@/app/app/(shell)/dashboard/tour-dates/page';
import CanonicalTourDatesPage from '@/app/app/(shell)/tour-dates/page';

beforeEach(() => {
  redirectMock.mockClear();
});

describe('shell alias redirects', () => {
  it('keeps contacts and tour aliases out of static redirects', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as RedirectRule[];

    expect(
      redirects
        .map(redirect => redirect.source)
        .filter(source =>
          [
            APP_ROUTES.CONTACTS,
            APP_ROUTES.DASHBOARD_CONTACTS,
            '/app/contact',
            APP_ROUTES.TOUR_DATES,
            APP_ROUTES.DASHBOARD_TOUR_DATES,
          ].includes(source)
        )
    ).toEqual([]);
  });

  it('routes contact aliases through shell pages to contact settings', () => {
    for (const Page of [
      ContactPage,
      CanonicalContactsPage,
      DashboardContactsPage,
    ]) {
      expect(() => Page()).toThrow(`REDIRECT:${APP_ROUTES.SETTINGS_CONTACTS}`);
    }

    expect(redirectMock).toHaveBeenCalledTimes(3);
  });

  it('routes tour aliases through shell pages to touring settings', () => {
    for (const Page of [CanonicalTourDatesPage, DashboardTourDatesPage]) {
      expect(() => Page()).toThrow(`REDIRECT:${APP_ROUTES.SETTINGS_TOURING}`);
    }

    expect(redirectMock).toHaveBeenCalledTimes(2);
  });
});
