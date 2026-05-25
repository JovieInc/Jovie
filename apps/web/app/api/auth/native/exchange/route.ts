import { createHash } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import {
  createAuthAnalyticsEvent,
  isAuthClient,
  type NativeAuthClient,
} from '@jovie/auth-routing';
import { NextResponse } from 'next/server';
import { consumeStoredNativeExchangeCode } from '@/lib/auth/routing-state.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';

export const runtime = 'nodejs';

const SIGN_IN_TOKEN_TTL_SECONDS = 60;
const SESSION_TOKEN_TTL_SECONDS = 60 * 60 * 12;

interface NativeExchangeRequest {
  client?: unknown;
  code?: unknown;
  state?: unknown;
  codeVerifier?: unknown;
}

function isNativeClient(client: unknown): client is NativeAuthClient {
  return isAuthClient(client) && (client === 'ios' || client === 'electron');
}

function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function isRealBrowserAuthHarnessEnabled(): boolean {
  return Boolean(process.env.JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN?.trim());
}

async function trackAuthEvent(
  event: Parameters<typeof createAuthAnalyticsEvent>[0],
  input: Parameters<typeof createAuthAnalyticsEvent>[1]
) {
  await trackServerEvent(event, createAuthAnalyticsEvent(event, input)).catch(
    () => undefined
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { status?: unknown; statusCode?: unknown };
  return record.status === 404 || record.statusCode === 404;
}

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

    const clerk = await clerkClient();
    let exchangePayload:
      | {
          ticket: string;
          expiresInSeconds: number;
        }
      | {
          sessionToken: string;
          sessionId: string;
          userId: string;
          expiresInSeconds: number;
        };

    try {
      const signInToken = await clerk.signInTokens.createSignInToken({
        userId: result.userId,
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
      });
      exchangePayload = {
        ticket: signInToken.token,
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
      };
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      const session = await clerk.sessions.createSession({
        userId: result.userId,
      });
      const token = await clerk.sessions.getToken(
        session.id,
        undefined,
        SESSION_TOKEN_TTL_SECONDS
      );
      exchangePayload = {
        sessionToken: token.jwt,
        sessionId: session.id,
        userId: session.userId,
        expiresInSeconds: SESSION_TOKEN_TTL_SECONDS,
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
