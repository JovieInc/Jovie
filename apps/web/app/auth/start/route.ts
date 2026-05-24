import { auth } from '@clerk/nextjs/server';
import {
  type AuthClient,
  type AuthIntent,
  buildAuthCallbackPath,
  createAuthAnalyticsEvent,
  isAuthClient,
  isAuthIntent,
  sanitizeReturnTo,
} from '@jovie/auth-routing';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { createStoredAuthState } from '@/lib/auth/routing-state.server';
import { publicEnv } from '@/lib/env-public';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';

export const runtime = 'nodejs';

function createState(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

function getAuthPageForIntent(intent: AuthIntent): string {
  return intent === 'sign_up' ? APP_ROUTES.SIGNUP : APP_ROUTES.SIGNIN;
}

function getStringParam(url: URL, key: string): string | null {
  const trimmed = url.searchParams.get(key)?.trim();
  return trimmed || null;
}

async function trackAuthEvent(
  event: Parameters<typeof createAuthAnalyticsEvent>[0],
  input: {
    readonly client: AuthClient;
    readonly intent: AuthIntent;
    readonly result?: string;
    readonly reason?: string;
    readonly returnTo?: string | null;
  }
) {
  await trackServerEvent(event, createAuthAnalyticsEvent(event, input)).catch(
    () => undefined
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawClient = getStringParam(url, 'client');
  const rawIntent = getStringParam(url, 'intent');
  const rateLimit = await generalLimiter.limit(
    `auth:start:${rawClient ?? 'unknown'}:${getClientIP(request)}`
  );
  if (!rateLimit.success) {
    if (isAuthClient(rawClient) && isAuthIntent(rawIntent)) {
      void trackAuthEvent('auth_wrong_surface_prevented', {
        client: rawClient,
        intent: rawIntent,
        result: 'blocked',
        reason: 'rate_limited',
      });
    }

    return NextResponse.json(
      { error: 'Too many auth attempts' },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rateLimit) },
      }
    );
  }

  if (!isAuthClient(rawClient) || !isAuthIntent(rawIntent)) {
    return NextResponse.json(
      { error: 'Invalid auth client or intent' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const returnTo = sanitizeReturnTo(
    rawClient,
    getStringParam(url, 'return_to')
  );
  if (!returnTo) {
    void trackAuthEvent('auth_wrong_surface_prevented', {
      client: rawClient,
      intent: rawIntent,
      result: 'blocked',
      reason: 'invalid_return_to',
      returnTo: getStringParam(url, 'return_to'),
    });
    return NextResponse.json(
      { error: 'Invalid return_to' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const codeChallenge = getStringParam(url, 'code_challenge');
  const codeChallengeMethod = getStringParam(url, 'code_challenge_method');
  if (
    rawClient !== 'web' &&
    (!codeChallenge || codeChallengeMethod !== 'S256')
  ) {
    return NextResponse.json(
      { error: 'Native auth requires PKCE' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const state = createState();
    const record = await createStoredAuthState({
      client: rawClient,
      intent: rawIntent,
      returnTo,
      state,
      codeChallenge,
    });

    void trackAuthEvent('auth_started', {
      client: rawClient,
      intent: rawIntent,
      result: 'started',
      returnTo,
    });

    const { userId } = await auth();
    if (userId) {
      return NextResponse.redirect(
        new URL(
          buildAuthCallbackPath(record.state),
          publicEnv.NEXT_PUBLIC_APP_URL
        ),
        { headers: NO_STORE_HEADERS }
      );
    }

    const authPage = new URL(getAuthPageForIntent(rawIntent), request.url);
    authPage.searchParams.set('auth_state', record.state);
    void trackAuthEvent('auth_provider_opened', {
      client: rawClient,
      intent: rawIntent,
      result: 'opened',
      returnTo,
    });

    return NextResponse.redirect(authPage, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Auth start route failed', error, {
      route: '/auth/start',
      client: rawClient,
      intent: rawIntent,
    });

    return NextResponse.json(
      { error: 'Auth is temporarily unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
