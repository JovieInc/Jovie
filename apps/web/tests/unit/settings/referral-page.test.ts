import { describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: {
    REFERRALS: '/app/referrals',
  },
}));

import SettingsReferralPage from '../../../app/app/(shell)/settings/referral/page';

describe('SettingsReferralPage', () => {
  it('redirects to /app/referrals', () => {
    expect(() => SettingsReferralPage()).toThrow(
      'NEXT_REDIRECT:/app/referrals'
    );
    expect(mockRedirect).toHaveBeenCalledWith('/app/referrals');
  });
});
