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
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import type { RateLimitResult } from '@/lib/rate-limit';
import {
  createRateLimiter,
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
  RATE_LIMITERS,
} from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const LOCAL_AUTH_START_LIMITER = createRateLimiter(RATE_LIMITERS.general, {
  preferRedis: false,
  warnOnFallback: false,
});

const DESKTOP_AUTH_FLOW_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function createState(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

function isLocalRuntime(): boolean {
  return env.NODE_ENV !== 'production';
}

async function limitAuthStart(key: string): Promise<RateLimitResult> {
  const rateLimit = await generalLimiter.limit(key);
  if (rateLimit.success) {
    return rateLimit;
  }

  const backendDegraded =
    rateLimit.unavailable === true || rateLimit.degraded === true;
  if (!backendDegraded) {
    // A healthy durable backend rejected the request — enforce the limit.
    return rateLimit;
  }

  if (isLocalRuntime()) {
    return LOCAL_AUTH_START_LIMITER.limit(key);
  }

  // Production with a degraded/unavailable limiter backend: treat the
  // auth-start limit as advisory (log + allow). A per-instance memory bucket
  // keyed by IP over-blocks real users behind carrier CGNAT during a Redis
  // outage, dead-ending sign-in. Bot defense is unaffected — Clerk still
  // gates the actual auth attempt; this limiter is only a pre-filter.
  logger.warn(
    'Rate-limit backend degraded — allowing auth start (advisory limit)',
    { key },
    'auth/start'
  );
  return { ...rateLimit, success: true, reason: undefined };
}

function wantsHtmlResponse(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html');
}

function getRetryAfterSeconds(rateLimit: RateLimitResult): number {
  const resetMs =
    rateLimit.reset instanceof Date ? rateLimit.reset.getTime() : Date.now();
  return Math.min(60, Math.max(3, Math.ceil((resetMs - Date.now()) / 1000)));
}

/**
 * /auth/start is browser-navigated, so a 429 must render a human-readable
 * page — never raw JSON. Auto-retries via meta refresh honoring Retry-After,
 * with a manual retry CTA as fallback. Static markup only (no user input).
 */
function createRateLimitedHtmlResponse(
  rateLimit: RateLimitResult
): NextResponse {
  const retryAfterSeconds = getRetryAfterSeconds(rateLimit);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="${retryAfterSeconds}" />
<title>Too many sign-in attempts — Jovie</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0b;color:#f5f4f0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<main style="max-width:400px;padding:32px 24px;text-align:center;">
<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Too many sign-in attempts</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#a1a1a6;">Wait a moment and try again. This page will retry automatically in ${retryAfterSeconds} seconds.</p>
<button type="button" onclick="location.reload()" style="appearance:none;border:0;cursor:pointer;background:#f5f4f0;color:#0b0b0b;font-size:15px;font-weight:600;font-family:inherit;padding:10px 24px;border-radius:9999px;">Try again</button>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 429,
    headers: {
      ...NO_STORE_HEADERS,
      ...createRateLimitHeaders(rateLimit),
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': String(retryAfterSeconds),
    },
  });
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
  const rateLimit = await limitAuthStart(
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

    if (wantsHtmlResponse(request)) {
      return createRateLimitedHtmlResponse(rateLimit);
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

  const rawDesktopFlow = getStringParam(url, 'desktop_flow');
  const desktopFlow =
    rawClient === 'electron' &&
    rawDesktopFlow &&
    DESKTOP_AUTH_FLOW_PATTERN.test(rawDesktopFlow)
      ? rawDesktopFlow
      : null;
  if (rawClient === 'electron' && rawDesktopFlow && !desktopFlow) {
    return NextResponse.json(
      { error: 'Invalid desktop_flow' },
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
      desktopFlow,
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
        new URL(buildAuthCallbackPath(record.state), request.url),
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
