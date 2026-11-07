/**
 * Better Auth rate-limit policy.
 *
 * Session reads are read-only and cookie-bound, and clients legitimately poll
 * them during hydration. Keeping them in Better Auth's shared IP bucket lets
 * unrelated users behind one NAT exhaust authentication for each other.
 * Credential and mutation endpoints remain durably rate-limited below.
 */
import { env } from '@/lib/env-server';
import { isProdcertCanaryEmail } from '@/lib/synthetic/prodcert-identities';

/**
 * Canonical deterministic E2E test-email shapes (`…+e2e…@` / `…+clerk_test…@`,
 * optionally with a trailing `+suffix` segment as used by
 * tests/helpers/auth.ts).
 */
const TEST_OTP_EMAIL_PATTERN = /\+(e2e|clerk_test)(\+[^@]*)?@/i;

/**
 * Staging synthetic principals: on the staging deployment (VERCEL_ENV=preview
 * built from main) the canonical test-email shape on our own test domains may
 * use the deterministic code without E2E_TEST_MODE, so agents can walk sign-up
 * on staging with no DB access. One strict anchored pattern: own domains only,
 * never an admin-looking local part (the seeded admin persona must not be
 * passwordless on staging).
 */
const STAGING_SYNTHETIC_EMAIL =
  /^(?!.*admin)[a-z0-9._-]+(\+[a-z0-9._-]+)*\+(e2e|clerk_test)(\+[a-z0-9._-]*)?@(jov\.ie|test\.jovie\.com)$/i;

/** Positive staging signal: PR previews are VERCEL_ENV=preview too. */
function isStagingDeployment(): boolean {
  return (
    env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'main'
  );
}

/**
 * Deterministic test-OTP gate. Fail closed:
 * - the email must match the canonical test shape (never any other address);
 * - VERCEL_ENV=production is always refused;
 * - on Vercel (VERCEL=1) with VERCEL_ENV unset or unknown: refused;
 * - staging (preview built from main): only STAGING_SYNTHETIC_EMAIL;
 * - other preview deployments, development, and local/CI runners (no Vercel):
 *   need the explicit E2E_TEST_MODE=1 opt-in.
 *
 * Lives here (not better-auth.ts) because the OTP rate-limit rules below need
 * it and better-auth.ts imports this module — importing it there would cycle.
 */
export function isDeterministicTestOtpEmail(email: string): boolean {
  if (!TEST_OTP_EMAIL_PATTERN.test(email)) return false;
  if (env.VERCEL_ENV === 'production') return false;
  if (
    process.env.VERCEL === '1' &&
    env.VERCEL_ENV !== 'preview' &&
    env.VERCEL_ENV !== 'development'
  ) {
    return false;
  }
  if (isStagingDeployment() && STAGING_SYNTHETIC_EMAIL.test(email)) return true;
  return env.E2E_TEST_MODE === '1';
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
 * Raised (still bounded) OTP budget for the production certification canaries
 * (JOV-9625 / JOV-10063).
 *
 * The deterministic test OTP above is intentionally refused in production, so
 * the production golden-path smoke authenticates two real canary identities
 * (the seeded returning canary and a per-run `+synthetic-prodcert-` address,
 * both on the Jovie-controlled jov.ie mailbox base) through the default
 * 3-per-60s-per-IP bucket. One smoke run's sign-in and signup attempts plus
 * retries exceed that budget, Better Auth 429s the send, the auth form never
 * advances to the code step, and the certification goes red on a healthy
 * deployment (run 41147485889; JOV-9835 / JOV-10063).
 *
 * Only the exact canary shapes from `isProdcertCanaryEmail` qualify — real
 * emails (and `+e2e`/`+clerk_test` shapes without the E2E guard) keep the
 * 3/60s window. Bounded, not unlimited: a worst-case smoke run needs at most
 * 6 sends per OTP path (sign-in + signup × 3 attempts).
 */
const PRODCERT_CANARY_OTP_RULE = { window: 60, max: 10 } as const;

/**
 * Function form (better-auth@1.6.23 resolves `(request, currentRule)`;
 * returning `false` disables limiting for that request).
 *
 * CI and local self-hosted runners collapse client IPs to 127.0.0.1, so the
 * plugin defaults (3 req / 60s per path, shared Upstash auth rate-limit counter)
 * are exhausted by concurrent golden-path / agent OTP traffic. Deterministic
 * E2E test emails therefore bypass this limit (triple-guarded above);
 * everyone else keeps the 3/60s window.
 *
 * Applied to both send + sign-in: Golden Path failed on
 * `/sign-in/email-otp` 429 after only send was exempted (PR #14456 run
 * 29629642549). The production certification canaries keep a bounded raised
 * budget instead (see PRODCERT_CANARY_OTP_RULE).
 */
async function deterministicTestOtpRule(
  request: Request
): Promise<false | { window: number; max: number }> {
  const email = await readOtpRequestEmail(request);
  if (email && isDeterministicTestOtpEmail(email)) {
    console.info(
      `[auth] deterministic test OTP rate limit bypassed ${JSON.stringify({
        vercelEnv: env.VERCEL_ENV ?? 'unset',
        email: `${email.slice(0, 2)}***${email.slice(email.lastIndexOf('@'))}`,
      })}`
    );
    return false;
  }
  if (email && isProdcertCanaryEmail(email)) {
    return PRODCERT_CANARY_OTP_RULE;
  }
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
