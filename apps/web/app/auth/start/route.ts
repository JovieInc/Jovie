import {
  type AuthClient,
  type AuthIntent,
  buildAuthCallbackPath,
  createAuthAnalyticsEvent,
  isAuthClient,
  isAuthIntent,
  isValidNativeAttempt,
  parseDesktopLoopbackPortParam,
  sanitizeReturnTo,
} from '@jovie/auth-routing';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { auth } from '@/lib/auth/better-auth';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  createStoredAuthState,
  readStoredAuthState,
} from '@/lib/auth/routing-state.server';
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
const AUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * A native sign-in started while the browser is already signed in. Offer the
 * signed-in account behind an explicit click (the Linear pattern) and keep
 * "Use a Different Account", which signs the browser out first. Both are
 * same-origin POSTs so a prefetch or a crafted link never authorizes the app
 * on its own.
 */
function createAccountChoiceHtmlResponse(
  state: string,
  email: string | null
): NextResponse {
  const safeEmail = email ? escapeHtml(email) : null;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Choose an account · Jovie</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: Canvas; color: CanvasText; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
main { width: min(360px, 100vw); box-sizing: border-box; padding: max(32px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); text-align: center; }
h1 { margin: 0 0 12px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
p { margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: GrayText; overflow-wrap: anywhere; }
form { margin: 0 0 8px; }
input[type=submit] { appearance: none; width: 100%; min-height: 44px; cursor: pointer; font: 600 15px/1.2 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 10px 24px; border-radius: 9999px; overflow-wrap: anywhere; }
input.primary { border: 0; background: CanvasText; color: Canvas; }
input.secondary { border: 1px solid GrayText; background: transparent; color: CanvasText; }
input[type=submit]:focus-visible { outline: 2px solid Highlight; outline-offset: 3px; }
</style>
</head>
<body>
<main>
<h1>Choose an account</h1>
<p>${safeEmail ? `You are signed in as ${safeEmail}.` : 'You are already signed in.'} Pick the account to use in the app.</p>
<form method="post" action="/auth/start">
<input type="hidden" name="auth_state" value="${state}" />
<input type="hidden" name="intent" value="sign_in" />
<input type="hidden" name="choice" value="continue" />
<input class="primary" type="submit" value="${safeEmail ? `Continue as ${safeEmail}` : 'Continue With This Account'}" />
</form>
<form method="post" action="/auth/start">
<input type="hidden" name="auth_state" value="${state}" />
<input type="hidden" name="intent" value="sign_in" />
<input class="secondary" type="submit" value="Use a Different Account" />
</form>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

async function readSignedInEmail(request: Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const email = session?.user?.email;
    return typeof email === 'string' && email.length > 0 ? email : null;
  } catch {
    // The choice page still works without the address.
    return null;
  }
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
      await trackAuthEvent('auth_wrong_surface_prevented', {
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

  const attempts = url.searchParams.getAll('native_attempt');
  const nativeAttempt = attempts[0];
  if (attempts.length > 1 || !isValidNativeAttempt(rawClient, nativeAttempt)) {
    return NextResponse.json(
      { error: 'Invalid native_attempt' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const returnTo = sanitizeReturnTo(
    rawClient,
    getStringParam(url, 'return_to')
  );
  if (!returnTo) {
    await trackAuthEvent('auth_wrong_surface_prevented', {
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

  const rawDesktopLoopback = getStringParam(url, 'desktop_loopback');
  const desktopLoopbackPort =
    rawClient === 'electron'
      ? parseDesktopLoopbackPortParam(rawDesktopLoopback)
      : null;
  if (rawClient === 'electron' && rawDesktopLoopback && !desktopLoopbackPort) {
    return NextResponse.json(
      { error: 'Invalid desktop_loopback' },
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
      ...(nativeAttempt !== undefined ? { nativeAttempt } : {}),
      desktopFlow,
      // Declared by Mac app builds that can redeem a typed return code.
      desktopReturnCode: getStringParam(url, 'desktop_return_code') === '1',
      // Declared by Mac app builds running a pending-flow loopback listener
      // (RFC 8252 section 7.3).
      desktopLoopbackPort,
    });

    await trackAuthEvent('auth_started', {
      client: rawClient,
      intent: rawIntent,
      result: 'started',
      returnTo,
    });

    const { userId } = await getCachedAuth();
    if (userId && rawClient !== 'web' && rawIntent === 'sign_in') {
      return createAccountChoiceHtmlResponse(
        record.state,
        await readSignedInEmail(request)
      );
    }

    if (userId) {
      return NextResponse.redirect(
        new URL(buildAuthCallbackPath(record.state), request.url),
        { headers: NO_STORE_HEADERS }
      );
    }

    const authPage = new URL(getAuthPageForIntent(rawIntent), request.url);
    authPage.searchParams.set('auth_state', record.state);
    await trackAuthEvent('auth_provider_opened', {
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

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    if (request.headers.get('origin') !== requestUrl.origin) {
      return NextResponse.json(
        { error: 'Invalid account switch origin' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const formData = await request.formData();
    const state = formData.get('auth_state');
    const intent = formData.get('intent');
    if (
      typeof state !== 'string' ||
      !AUTH_STATE_PATTERN.test(state) ||
      intent !== 'sign_in'
    ) {
      return NextResponse.json(
        { error: 'Invalid account switch request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const stateRecord = await readStoredAuthState({ state });
    if (
      !stateRecord ||
      stateRecord.client === 'web' ||
      stateRecord.intent !== 'sign_in'
    ) {
      return NextResponse.json(
        { error: 'Account switch expired' },
        { status: 410, headers: NO_STORE_HEADERS }
      );
    }

    if (formData.get('choice') === 'continue') {
      // Continue with the browser's current account: the callback mints the
      // native handoff from this session. It re-checks the session and
      // consumes the one-time state, so a stale page cannot replay it.
      const { userId } = await getCachedAuth();
      if (!userId) {
        const signInPage = new URL(APP_ROUTES.SIGNIN, request.url);
        signInPage.searchParams.set('auth_state', state);
        return NextResponse.redirect(signInPage, {
          status: 303,
          headers: NO_STORE_HEADERS,
        });
      }
      return NextResponse.redirect(
        new URL(buildAuthCallbackPath(state), request.url),
        { status: 303, headers: NO_STORE_HEADERS }
      );
    }

    const signOutResponse = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });
    const authPage = new URL(APP_ROUTES.SIGNIN, request.url);
    authPage.searchParams.set('auth_state', state);
    const response = NextResponse.redirect(authPage, {
      headers: NO_STORE_HEADERS,
    });
    for (const cookie of signOutResponse.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie);
    }
    return response;
  } catch (error) {
    await captureError('Auth account switch failed', error, {
      route: '/auth/start',
    });
    return NextResponse.json(
      { error: 'Auth is temporarily unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
