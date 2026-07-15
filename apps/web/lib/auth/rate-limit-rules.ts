/**
 * Better Auth rate-limit policy.
 *
 * Session reads are read-only and cookie-bound, and clients legitimately poll
 * them during hydration. Keeping them in Better Auth's shared IP bucket lets
 * unrelated users behind one NAT exhaust authentication for each other.
 * Credential and mutation endpoints remain durably rate-limited below.
 */
export const AUTH_RATE_LIMIT_RULES = {
  '/get-session': false,
  '/sign-in/social': { window: 60, max: 10 },
  '/email-otp/send-verification-otp': { window: 60, max: 3 },
  '/phone-number/send-otp': { window: 60, max: 3 },
  '/phone-number/verify': { window: 60, max: 5 },
  '/one-time-token/verify': { window: 60, max: 10 },
} as const;
