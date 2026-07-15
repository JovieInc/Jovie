import 'server-only';

import { createHmac } from 'node:crypto';
import { oauthProvider } from '@better-auth/oauth-provider';
import {
  type BetterAuthOptions,
  type BetterAuthPlugin,
  betterAuth,
} from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import {
  bearer,
  emailOTP,
  jwt,
  oneTap,
  oneTimeToken,
  phoneNumber,
} from 'better-auth/plugins';
import { db } from '@/lib/db';
import {
  baAccounts,
  baJwks,
  baOauthAccessTokens,
  baOauthClients,
  baOauthConsents,
  baOauthRefreshTokens,
  baSessions,
  baUsers,
  baVerifications,
} from '@/lib/db/schema/better-auth';
import { env } from '@/lib/env';
import { publicEnv } from '@/lib/env-public';
import { captureError } from '@/lib/error-tracking';
import { generateAppleClientSecret } from './apple-client-secret';
import { phoneVerification } from './phone-verification';
import { AUTH_RATE_LIMIT_RULES } from './rate-limit-rules';
import { secondaryStorage } from './secondary-storage';

export { AUTH_RATE_LIMIT_RULES } from './rate-limit-rules';

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
 * Trusted origins: production + staging + local dev + native deep-link
 * schemes. Vercel previews are scoped to the exact deployment URL via the
 * function form — never a bare *.vercel.app wildcard (plan eng row 36).
 */
export const STATIC_TRUSTED_ORIGINS = [
  'https://jov.ie',
  'https://staging.jov.ie',
  'http://localhost:3100',
  'ie.jov.jovie://',
  'jovie://',
  'logyourbody://',
] as const;

function resolveTrustedOrigins(): (string | undefined)[] {
  const previewOrigin =
    env.VERCEL_ENV === 'preview' && env.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : undefined;
  return [...STATIC_TRUSTED_ORIGINS, previewOrigin];
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

function getTemporaryPhoneEmail(phone: string): string {
  const secret = resolveSecret();
  if (!secret) throw new Error('Better Auth secret is required');
  const digest = createHmac('sha256', secret).update(phone).digest('hex');
  return `${digest}@phone.identity.jov.ie`;
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
    phoneNumber({
      expiresIn: 300,
      allowedAttempts: 5,
      phoneNumberValidator: phone => /^\+[1-9]\d{7,14}$/.test(phone),
      sendOTP: async ({ phoneNumber: phone }) => {
        await phoneVerification.start(phone);
      },
      verifyOTP: async ({ phoneNumber: phone, code }) =>
        phoneVerification.check(phone, code),
      signUpOnVerification: {
        getTempEmail: getTemporaryPhoneEmail,
        getTempName: () => 'Member',
      },
    }),
    ...(googleOneTapClientId
      ? [oneTap({ clientId: googleOneTapClientId })]
      : []),
    bearer(),
    jwt({
      disableSettingJwtHeader: true,
      jwks: {
        keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' },
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 30,
      },
    }),
    oauthProvider({
      loginPage: '/identity',
      consentPage: '/identity',
      signup: { page: '/identity' },
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      accessTokenExpiresIn: 15 * 60,
      refreshTokenExpiresIn: 60 * 60 * 24 * 30,
      storeClientSecret: 'hashed',
      storeTokens: 'hashed',
      cachedTrustedClients: new Set([
        'logyourbody-ios',
        'logyourbody-supabase',
      ]),
    }) as BetterAuthPlugin,
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
  // The OAuth provider owns /oauth2/token. Disable the JWT plugin's legacy
  // session-token endpoint so clients cannot use two token contracts.
  disabledPaths: ['/token'],
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
      jwks: baJwks,
      oauthClient: baOauthClients,
      oauthRefreshToken: baOauthRefreshTokens,
      oauthAccessToken: baOauthAccessTokens,
      oauthConsent: baOauthConsents,
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
  telemetry: { enabled: false },
  plugins: buildPlugins(),
});
