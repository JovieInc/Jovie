import { APP_ROUTES } from '@/constants/routes';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';

/**
 * Closed public signup (canon/PRODUCT.md, 2026-11-02). When the
 * `PUBLIC_SIGNUP_CLOSED` code flag is on, anonymous visitors to `/signup` and
 * `/start` land on the `/waitlist` role form. Sign-in and waitlist invite
 * links are untouched, so existing users and invitees still get in.
 */
export function isPublicSignupClosed(): boolean {
  return isCodeFlagEnabled('PUBLIC_SIGNUP_CLOSED');
}

export const PUBLIC_SIGNUP_CLOSED_REDIRECT = APP_ROUTES.WAITLIST;
