import 'server-only';

import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { bearer, emailOTP, oneTap, oneTimeToken } from 'better-auth/plugins';
import { db } from '@/lib/db';
import {
  baAccounts,
  baSessions,
  baUsers,
  baVerifications,
} from '@/lib/db/schema/better-auth';
import { env } from '@/lib/env';
import { publicEnv } from '@/lib/env-public';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { generateAppleClientSecret } from './apple-client-secret';
import { provisionAppUser } from './provision';
import { secondaryStorage } from './secondary-storage';

/**
 * Better Auth server instance (Clerk → Better Auth migration; see
 * docs/auth/better-auth-migration-plan.md).
 *
 * Inert at this commit: only app/api/auth/[...all]/route.ts imports it. The
 * identity flip (cached/gate/proxy/client) lands in later commits of the
 * same PR.
 */

export const DETERMINISTIC_TEST_OTP = '424242';

/**
 * Deterministic E2E OTP gate (triple-guarded, plan security row 11):
 * requires E2E_TEST_MODE=1, hard-blocked on production deploys, and only for
 * the repo's canonical test-email shapes (`…+e2e…@` / `…+clerk_test…@`,
 * optionally with a trailing `+suffix` segment as used by
 * tests/helpers/clerk-auth.ts).
 */
const TEST_OTP_EMAIL_PATTERN = /\+(e2e|clerk_test)(\+[^@]*)?@/i;

export function isDeterministicTestOtpEmail(email: string): boolean {
  return (
    env.E2E_TEST_MODE === '1' &&
    env.VERCEL_ENV !== 'production' &&
    TEST_OTP_EMAIL_PATTERN.test(email)
  );
}

/**
 * Durable rate limits for the new public auth endpoints (plan eng row 28).
 * Windows are seconds. Stored via secondary storage (Redis) — never
 * in-memory in production (security.md).
 */
export const AUTH_RATE_LIMIT_RULES = {
  '/sign-in/social': { window: 60, max: 10 },
  '/email-otp/send-verification-otp': { window: 60, max: 3 },
  '/one-time-token/verify': { window: 60, max: 10 },
} as const;

/**
 * Trusted origins: production + staging + local dev + native deep-link
 * schemes. Vercel previews are scoped to the exact deployment URL via the
 * function form — never a bare *.vercel.app wildcard (plan eng row 36).
 */
export const STATIC_TRUSTED_ORIGINS = [
  'https://jov.ie',
  'https://staging.jov.ie',
  // Local web defaults + desktop local shell (APP_URL=http://localhost:3112).
  'http://localhost:3100',
  'http://localhost:3112',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:3112',
  'ie.jov.jovie://',
  'jovie://',
  'jovie-local://',
  'jovie-staging://',
] as const;

function resolveTrustedOrigins(): (string | undefined)[] {
  const previewOrigin =
    env.VERCEL_ENV === 'preview' && env.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : undefined;
  // Allow the process-bound local origin when agents/desktop pick a non-default
  // PORT (still loopback-only — never a public host).
  const port = process.env.PORT?.trim();
  const dynamicLocal =
    port && /^\d+$/.test(port)
      ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`]
      : [];
  return [...STATIC_TRUSTED_ORIGINS, ...dynamicLocal, previewOrigin];
}

/**
 * Non-production fallback keeps local dev and CI builds working without a
 * configured secret. Production deploys (VERCEL_ENV=production) never fall
 * back: a missing BETTER_AUTH_SECRET fails fast inside better-auth.
 */
const NON_PRODUCTION_FALLBACK_SECRET =
  'jovie-non-production-better-auth-fallback-secret';

function resolveSecret(): string | undefined {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  return env.VERCEL_ENV === 'production'
    ? undefined
    : NON_PRODUCTION_FALLBACK_SECRET;
}

function resolveBaseUrl(): string | undefined {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  return env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
}

/** Providers are included only when their credentials exist (env-gated). */
function buildSocialProviders(): NonNullable<
  BetterAuthOptions['socialProviders']
> {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};
  if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
    };
  }
  if (
    env.AUTH_APPLE_CLIENT_ID &&
    env.AUTH_APPLE_TEAM_ID &&
    env.AUTH_APPLE_KEY_ID &&
    env.AUTH_APPLE_PRIVATE_KEY
  ) {
    providers.apple = {
      clientId: env.AUTH_APPLE_CLIENT_ID,
      // better-auth@1.6.23 requires a pre-signed ES256 JWT (verified against
      // the installed source) — minted from the .p8 components.
      clientSecret: generateAppleClientSecret(),
      // Lets the iOS app's native Sign in with Apple id_token (audience =
      // bundle id) verify against the same provider.
      appBundleIdentifier: 'ie.jov.jovie',
    };
  }
  return providers;
}

function buildPlugins() {
  const googleOneTapClientId = publicEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return [
    emailOTP({
      expiresIn: 600,
      allowedAttempts: 5,
      // Returning '' falls through to better-auth's default generator
      // (`generateOTP(...) || defaultOTPGenerator(...)` at 1.6.23).
      generateOTP: ({ email }) =>
        isDeterministicTestOtpEmail(email) ? DETERMINISTIC_TEST_OTP : '',
      sendVerificationOTP: async ({ email, type, otp }) => {
        if (isDeterministicTestOtpEmail(email)) {
          // Deterministic E2E path: specs type 424242, nothing is sent.
          return;
        }
        // Real Resend sender (plan decision 8, client-flip commit ⑦).
        // Lazy import to avoid pulling the email stack into the auth module's
        // hot path when the OTP hook is never called.
        try {
          const { sendEmail } = await import('@/lib/email/send');
          const {
            getAuthOtpHtml,
            getAuthOtpFromEmail,
            getAuthOtpSubject,
            getAuthOtpText,
          } = await import('@/lib/email/templates/auth-otp');
          await sendEmail({
            to: email,
            from: getAuthOtpFromEmail(),
            subject: getAuthOtpSubject(),
            text: getAuthOtpText({ otpCode: otp }),
            html: getAuthOtpHtml({ otpCode: otp }),
          });
        } catch (error) {
          // Never throw from the OTP hook — a Resend failure should surface
          // to the user via the form's aria-live error state, not crash the
          // BA callback. The caller (EmailCodeAuthForm) sees a generic
          // "Could not send the code" error.
          await captureError('Email OTP send failed', error, {
            email: email.replace(/@.*/, '@[redacted]'),
            type,
            operation: 'sendVerificationOTP',
          });
          throw error;
        }
      },
    }),
    ...(googleOneTapClientId
      ? [oneTap({ clientId: googleOneTapClientId })]
      : []),
    bearer(),
    oneTimeToken({
      // Minutes at 1.6.23 (default 3). Covers the native handoff window.
      expiresIn: 5,
      // Client-callable generate is a cookie→bearer exfil vector (row 29).
      disableClientRequest: true,
      storeToken: 'hashed',
    }),
    // nextCookies MUST stay last so Set-Cookie propagates through Next.js
    // server actions (better-auth docs + plan).
    nextCookies(),
  ];
}

export const auth = betterAuth({
  appName: 'Jovie',
  baseURL: resolveBaseUrl(),
  secret: resolveSecret(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Explicit: the repo bans db.transaction(); do not rely on the adapter
    // default staying false (plan eng row 32).
    transaction: false,
    schema: {
      user: baUsers,
      session: baSessions,
      account: baAccounts,
      verification: baVerifications,
    },
  }),
  socialProviders: buildSocialProviders(),
  session: {
    expiresIn: 604800, // 7 days
    updateAge: 86400, // roll expiry at most once per day
    cookieCache: { enabled: true, maxAge: 300 },
    // Postgres stays the durable session store; Redis loss ≠ mass logout.
    storeSessionInDatabase: true,
  },
  verification: {
    // Keep OTP/verification values durable in ba_verifications as well —
    // secondary storage is best-effort by design.
    storeInDatabase: true,
  },
  secondaryStorage,
  rateLimit: {
    enabled: true,
    storage: 'secondary-storage',
    customRules: AUTH_RATE_LIMIT_RULES,
  },
  trustedOrigins: () => resolveTrustedOrigins(),
  databaseHooks: {
    user: {
      create: {
        after: async user => {
          try {
            await provisionAppUser({
              betterAuthUserId: user.id,
              email: user.email,
              emailVerified: user.emailVerified,
              name: user.name,
            });
          } catch (error) {
            // provisionAppUser never throws by contract; this is
            // belt-and-braces so the OAuth callback can never fail here.
            // gate.ts lazy-create heals on the next request.
            logger.error('[auth] provision hook failed', error);
            await captureError('Better Auth provision hook failed', error, {
              betterAuthUserId: user.id,
              operation: 'databaseHooks.user.create.after',
            });
          }
        },
      },
    },
  },
  telemetry: { enabled: false },
  plugins: buildPlugins(),
});
