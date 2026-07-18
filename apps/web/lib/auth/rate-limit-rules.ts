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
 * Lives here (not better-auth.ts) because the OTP rate-limit rule below needs
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
 * Read the OTP recipient out of a `/email-otp/send-verification-otp` request.
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

export const AUTH_RATE_LIMIT_RULES = {
  '/get-session': false,
  '/sign-in/social': { window: 60, max: 10 },
  // Function form (better-auth@1.6.23 resolves `(request, currentRule)`;
  // returning `false` disables limiting for that request). CI sends many OTPs
  // from one loopback IP against the shared Upstash bucket, which external
  // dev/agent runs exhaust — deterministic E2E test emails therefore bypass
  // this limit (triple-guarded above); everyone else keeps 3 sends/60s.
  '/email-otp/send-verification-otp': async (request: Request) => {
    const email = await readOtpRequestEmail(request);
    if (email && isDeterministicTestOtpEmail(email)) return false;
    return { window: 60, max: 3 };
  },
  '/phone-number/send-otp': { window: 60, max: 3 },
  '/phone-number/verify': { window: 60, max: 5 },
  '/one-time-token/verify': { window: 60, max: 10 },
} as const;
