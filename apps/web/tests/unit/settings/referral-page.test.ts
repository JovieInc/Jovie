import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import SettingsReferralPage from '../../../app/app/(shell)/settings/referral/page';

describe('SettingsReferralPage', () => {
  it(`redirects to ${APP_ROUTES.REFERRALS}`, () => {
    expect(() => SettingsReferralPage()).toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.REFERRALS}`
    );
    expect(mockRedirect).toHaveBeenCalledWith(APP_ROUTES.REFERRALS);
  });
});
