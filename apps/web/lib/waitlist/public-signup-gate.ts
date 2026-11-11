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

/**
 * One-flow onboarding (Tim, 2026-11-09). On by default; the
 * `ONE_FLOW_ONBOARDING` code flag is the kill switch.
 */
export function isOneFlowOnboarding(): boolean {
  return isCodeFlagEnabled('ONE_FLOW_ONBOARDING');
}

/**
 * Anonymous `/start` leaves for `/waitlist` only while signup is closed and
 * one-flow onboarding is off. Otherwise the chat runs and admission decides.
 */
export function shouldRedirectAnonymousStart(): boolean {
  return isPublicSignupClosed() && !isOneFlowOnboarding();
}

/**
 * While signup is closed, an anonymous chat always uses the controlled
 * golden-path admission, whatever the DB gate says, so the chat can never
 * promise instant access that the claim would then hold.
 */
export function mustControlAnonymousAccess(isSignedIn: boolean): boolean {
  return !isSignedIn && isPublicSignupClosed();
}
