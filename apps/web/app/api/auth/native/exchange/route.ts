import { createHash } from 'node:crypto';
import {
  createAuthAnalyticsEvent,
  isAuthClient,
  type NativeAuthClient,
} from '@jovie/auth-routing';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/better-auth';
import { consumeStoredNativeExchangeCode } from '@/lib/auth/routing-state.server';
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';

export const runtime = 'nodejs';

/**
 * Native auth exchange (Clerk → Better Auth migration, plan decision 9).
 *
 * PKCE verify → OTT verify → fresh native session per client (audit row 12:
 * independent native sessions — sign out of the Mac app no longer signs you
 * out of Safari). One path per client, no fallbacks.
 *
 *   iOS     → server redeems `verifyOneTimeToken` and returns the raw
 *             `session.token` from a freshly created `ba_sessions` row.
 *             The iOS client stores the raw token in Keychain and uses the
 *             bearer plugin for subsequent API calls.
 *
 *   Electron → returns the OTT. The `native-complete` page POSTs it to the
 *             built-in `/api/auth/one-time-token/verify` which sets the
 *             session cookie itself (verified from plugin source — no
 *             setActive, no custom cookie code).
 */

interface NativeExchangeRequest {
  client?: unknown;
  code?: unknown;
  state?: unknown;
  codeVerifier?: unknown;
}

/**
 * Response shape — kept stable with the iOS `NativeAuthExchangeResponse`
 * Swift struct (`ticket`/`sessionToken`/`sessionId`/`userId`/
 * `expiresInSeconds`/`returnTo`). iOS decodes unchanged.
 */
type NativeExchangePayload =
  | {
      sessionToken: string;
      sessionId: string;
      userId: string;
      expiresInSeconds: number;
    }
  | {
      ticket: string;
      userId: string;
      expiresInSeconds: number;
    };

function isNativeClient(client: unknown): client is NativeAuthClient {
  return isAuthClient(client) && (client === 'ios' || client === 'electron');
}

function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function isProductionRuntimeEnvironment(): boolean {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv) {
    return vercelEnv === 'production';
  }

  return env.NODE_ENV === 'production';
}

function isRealBrowserAuthHarnessEnabled(): boolean {
  return (
    !isProductionRuntimeEnvironment() &&
    Boolean(env.JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN?.trim())
  );
}

async function trackAuthEvent(
  event: Parameters<typeof createAuthAnalyticsEvent>[0],
  input: Parameters<typeof createAuthAnalyticsEvent>[1]
) {
  await trackServerEvent(event, createAuthAnalyticsEvent(event, input)).catch(
    () => undefined
  );
}

/**
 * Fresh session expiry handed to native clients. Better Auth's session
 * `expiresIn` is 7 days (better-auth.ts); we surface that so the client
 * knows when to expect a `set-auth-token` roll (updateAge = 1 day). The
 * client-side expiry-clearing path is removed (eng row 31) — the bearer
 * plugin's `set-auth-token` response header refreshes the stored token +
 * expiry on each API call.
 */
const NATIVE_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  try {
    const payload = (await request
      .json()
      .catch(() => ({}))) as NativeExchangeRequest;
    const client = payload.client;
    const code = payload.code;
    const state = payload.state;
    const codeVerifier = payload.codeVerifier;
    if (!isRealBrowserAuthHarnessEnabled()) {
      const rateLimit = await generalLimiter.limit(
        `auth:exchange:${
          typeof client === 'string' ? client.trim() || 'unknown' : 'unknown'
        }:${getClientIP(request)}`
      );
      if (!rateLimit.success) {
        if (isNativeClient(client)) {
          void trackAuthEvent('auth_exchange_failed', {
            client,
            intent: 'sign_in',
            result: 'failed',
            reason: 'rate_limited',
          });
        }

        return NextResponse.json(
          { error: 'Too many auth exchange attempts' },
          {
            status: 429,
            headers: {
              ...NO_STORE_HEADERS,
              ...createRateLimitHeaders(rateLimit),
            },
          }
        );
      }
    }

    if (
      !isNativeClient(client) ||
      typeof code !== 'string' ||
      typeof state !== 'string' ||
      typeof codeVerifier !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Invalid native auth exchange request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await consumeStoredNativeExchangeCode({
      client,
      code,
      state,
      codeVerifier,
      createCodeChallenge,
    });

    if (!result.ok) {
      void trackAuthEvent('auth_exchange_failed', {
        client,
        intent: 'sign_in',
        result: 'failed',
        reason: result.reason,
      });

      return NextResponse.json(
        { error: 'Invalid native auth exchange', reason: result.reason },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // OTT is required for both native clients under BA. Missing OTT means
    // the auth callback failed to mint one — surface as `ott_missing` so the
    // client can restart the flow with a clear message (plan design row 24).
    if (!result.ott) {
      void trackAuthEvent('auth_exchange_failed', {
        client,
        intent: 'sign_in',
        result: 'failed',
        reason: 'ott_missing',
      });

      return NextResponse.json(
        {
          error: 'Native auth exchange missing one-time token',
          reason: 'ott_missing',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let exchangePayload: NativeExchangePayload;
    if (client === 'ios') {
      exchangePayload = await createIosNativeExchangePayload(
        result.ott,
        result.userId,
        request
      );
    } else {
      // Electron: return the OTT. The native-complete page POSTs it to
      // `/api/auth/one-time-token/verify` which sets the session cookie.
      // `ticket` field name is preserved for Swift/Electron decode compat.
      exchangePayload = {
        ticket: result.ott,
        userId: result.userId,
        expiresInSeconds: 300, // OTT TTL (5 min) — matches the plugin config
      };
    }

    void trackAuthEvent('auth_exchange_succeeded', {
      client,
      intent: 'sign_in',
      result: 'succeeded',
      returnTo: result.returnTo,
    });

    return NextResponse.json(
      {
        returnTo: result.returnTo,
        ...exchangePayload,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Native auth exchange route failed', error, {
      route: '/api/auth/native/exchange',
    });

    return NextResponse.json(
      { error: 'Native auth exchange failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * iOS: verify the OTT server-side, then create a FRESH `ba_sessions` row
 * independent of the completing browser's session (audit row 12 — kills the
 * "sign out of the Mac app signs you out of Safari" bug). Return the raw
 * `session.token` for Keychain + bearer plugin auth.
 *
 * `verifyOneTimeToken` consumes the OTT (single-use) and returns the
 * user. `internalAdapter.createSession` mints a new session row bound
 * to that user. The returned `expiresInSeconds` matches Better Auth's
 * `session.expiresIn` (7 days). The iOS client never needs to refresh —
 * the bearer plugin's `set-auth-token` response header refreshes the
 * stored token + expiry on each API call (eng row 31).
 */
async function createIosNativeExchangePayload(
  ott: string,
  expectedUserId: string,
  request: Request
): Promise<NativeExchangePayload> {
  const verification = await auth.api.verifyOneTimeToken({
    body: { token: ott },
    request,
    // A full Request makes Better Auth return a raw Response by default.
    // Keep the direct API's parsed-result and thrown-error behavior here.
    asResponse: false,
  });

  const verifiedUserId = verification?.user?.id ?? null;
  if (!verifiedUserId || verifiedUserId !== expectedUserId) {
    throw new Error('OTT user mismatch');
  }

  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(verifiedUserId);

  if (!session?.token || !session.id) {
    throw new Error('Native session creation failed');
  }

  return {
    sessionToken: session.token,
    sessionId: session.id,
    userId: verifiedUserId,
    expiresInSeconds: NATIVE_SESSION_EXPIRES_IN_SECONDS,
  };
}
