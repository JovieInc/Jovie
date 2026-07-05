/**
 * Auth / signup / onboarding canary fixtures (JOV-1871)
 *
 * Stable route constants for the golden-path canary spec. These paths are
 * intentionally anonymous — no seeded profile or Clerk account is required.
 */

import { AUTH_SIGNUP_ONBOARDING_ROUTES } from '@/lib/canaries/auth-signup-onboarding';

export const AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES = {
  signup: AUTH_SIGNUP_ONBOARDING_ROUTES.signup,
  signin: AUTH_SIGNUP_ONBOARDING_ROUTES.signin,
  start: AUTH_SIGNUP_ONBOARDING_ROUTES.start,
} as const;
