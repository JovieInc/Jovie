import { APP_ROUTES } from '@/constants/routes';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';

/**
 * Closed public signup (canon/PRODUCT.md, 2026-11-02). When the
 * `PUBLIC_SIGNUP_CLOSED` code flag is on, anonymous visitors to `/signup` and
 * `/start` land on the closed `/waitlist` entry. The temporary destination
 * offers sign-in and emailed-invitation recovery; role capture ships separately.
 */
export function isPublicSignupClosed(): boolean {
  return isCodeFlagEnabled('PUBLIC_SIGNUP_CLOSED');
}

export const PUBLIC_SIGNUP_CLOSED_REDIRECT = APP_ROUTES.WAITLIST;
