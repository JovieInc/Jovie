/**
 * Better Auth rate-limit policy.
 *
 * Session reads are read-only and cookie-bound, and clients legitimately poll
 * them during hydration. Keeping them in Better Auth's shared IP bucket lets
 * unrelated users behind one NAT exhaust authentication for each other.
 * Credential and mutation endpoints remain durably rate-limited below.
 */
import { env } from '@/lib/env-server';

/**
 * Canonical deterministic E2E test-email shapes (`…+e2e…@` / `…+clerk_test…@`,
 * optionally with a trailing `+suffix` segment as used by
 * tests/helpers/clerk-auth.ts).
 */
const TEST_OTP_EMAIL_PATTERN = /\+(e2e|clerk_test)(\+[^@]*)?@/i;

/**
 * Deterministic E2E OTP gate (triple-guarded, plan security row 11):
 * requires E2E_TEST_MODE=1, hard-blocked on production deploys, and only for
 * the repo's canonical test-email shapes.
 *
 * Lives here (not better-auth.ts) because the OTP rate-limit rules below need
 * it and better-auth.ts imports this module — importing it there would cycle.
 */
export function isDeterministicTestOtpEmail(email: string): boolean {
  return (
    env.E2E_TEST_MODE === '1' &&
    env.VERCEL_ENV !== 'production' &&
    TEST_OTP_EMAIL_PATTERN.test(email)
  );
}

/**
 * Read the OTP recipient out of an email-OTP request body.
 * The request is cloned before parsing so Better Auth's own body read still
 * works. Unparseable bodies stay rate-limited (fail-closed).
 */
async function readOtpRequestEmail(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.clone().json();
    if (body && typeof body === 'object' && 'email' in body) {
      const { email } = body as { email: unknown };
      return typeof email === 'string' ? email : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Function form (better-auth@1.6.23 resolves `(request, currentRule)`;
 * returning `false` disables limiting for that request).
 *
 * CI and local self-hosted runners collapse client IPs to 127.0.0.1, so the
 * plugin defaults (3 req / 60s per path, shared Upstash secondary storage)
 * are exhausted by concurrent golden-path / agent OTP traffic. Deterministic
 * E2E test emails therefore bypass this limit (triple-guarded above);
 * everyone else keeps the 3/60s window.
 *
 * Applied to both send + sign-in: Golden Path failed on
 * `/sign-in/email-otp` 429 after only send was exempted (PR #14456 run
 * 29629642549).
 */
async function deterministicTestOtpRule(
  request: Request
): Promise<false | { window: number; max: number }> {
  const email = await readOtpRequestEmail(request);
  if (email && isDeterministicTestOtpEmail(email)) return false;
  return { window: 60, max: 3 };
}

export const AUTH_RATE_LIMIT_RULES = {
  '/get-session': false,
  '/sign-in/social': { window: 60, max: 10 },
  '/email-otp/send-verification-otp': deterministicTestOtpRule,
  // emailOTP plugin default is also 3/60s for sign-in; same shared-IP race as
  // send. customRules win over plugin.rateLimit when the path key matches
  // (better-auth rate-limiter resolveRateLimitConfig).
  '/sign-in/email-otp': deterministicTestOtpRule,
  '/phone-number/send-otp': { window: 60, max: 3 },
  '/phone-number/verify': { window: 60, max: 5 },
  '/one-time-token/verify': { window: 60, max: 10 },
} as const;
