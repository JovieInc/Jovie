import 'server-only';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSecureEnv } from '@/lib/env-server';
import { createAuthenticatedCorsHeaders } from '@/lib/http/headers';
import {
  encodeSessionCookie,
  ONBOARDING_SESSION_COOKIE_NAME,
  verifySessionCookie,
} from '@/lib/onboarding/session';
import {
  checkAnonymousChatRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import {
  isTurnstileConfigured,
  verifyTurnstileToken,
} from '@/lib/turnstile/verify';

/**
 * Anonymous onboarding chat handler (JOV-2132 PR 1 — scaffolding).
 *
 * Wires the request through the abuse-containment gates that PR 2's actual
 * LLM tools will run behind:
 *  1. Resolve or mint a signed onboarding session cookie.
 *  2. Resolve IP + ASN from request headers.
 *  3. Verify a Cloudflare Turnstile token on the first message of the session.
 *  4. Apply IP + ASN + session-lifetime rate limits.
 *  5. Return 501 Not Implemented (real LLM dispatch lands in PR 2).
 *
 * Returns `null` when the request is not addressed to onboarding mode, so the
 * main `/api/chat` handler can fall through to the authenticated chat flow.
 */

const TURNSTILE_VERIFIED_FLAG_PREFIX = 'anon_onb_chat_verified';

const onboardingPayloadSchema = z.object({
  mode: z.literal('onboarding'),
  turnstileToken: z.string().max(2048).optional(),
});

interface PeekedBody {
  readonly raw: unknown;
  readonly mode?: string;
  readonly turnstileToken?: string;
}

/**
 * Peek the request body for `mode`. Cloned to leave the original body intact
 * for downstream handlers (Next's Request body is consumed once).
 */
async function peekOnboardingMode(req: Request): Promise<PeekedBody | null> {
  let raw: unknown;
  try {
    raw = await req.clone().json();
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  return {
    raw,
    mode: typeof obj.mode === 'string' ? obj.mode : undefined,
    turnstileToken:
      typeof obj.turnstileToken === 'string' ? obj.turnstileToken : undefined,
  };
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

function extractAsn(req: Request): string | null {
  // Cloudflare exposes ip-asn; Vercel proxies sometimes do the same.
  return (
    req.headers.get('x-vercel-ip-asn')?.trim() ||
    req.headers.get('cf-ip-asn')?.trim() ||
    null
  );
}

/**
 * Return a Response if this request should be handled as anonymous onboarding,
 * or `null` if the caller should fall through to the authenticated flow.
 */
export async function tryHandleAnonymousOnboardingChat(
  req: Request,
  requestId: string
): Promise<Response | null> {
  const peeked = await peekOnboardingMode(req);
  if (!peeked || peeked.mode !== 'onboarding') return null;

  const corsHeaders = createAuthenticatedCorsHeaders(
    req.headers.get('origin'),
    'POST, OPTIONS'
  );

  // Validate the onboarding-shaped envelope (other fields validated in PR 2).
  const parsed = onboardingPayloadSchema.safeParse(peeked.raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid onboarding chat request',
        errorCode: 'INVALID_ONBOARDING_PAYLOAD',
        requestId,
      },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  Sentry.setTag('chat_mode', 'onboarding');
  Sentry.setTag('chat_anonymous', 'true');

  // --- Session cookie: read existing or mint a new one ---
  const incomingCookieHeader = req.headers.get('cookie') || '';
  const cookieMap = parseCookieHeader(incomingCookieHeader);
  const existingSessionId = verifySessionCookie(
    cookieMap.get(ONBOARDING_SESSION_COOKIE_NAME)
  );

  let sessionId: string;
  let mintedSessionCookie: string | null = null;
  if (existingSessionId) {
    sessionId = existingSessionId;
  } else {
    sessionId = randomUUID();
    mintedSessionCookie = encodeSessionCookie(sessionId);
  }

  const ip = extractClientIp(req);
  const asn = extractAsn(req);

  // --- Turnstile gate: required for the first message of a fresh session ---
  if (!existingSessionId) {
    if (isTurnstileConfigured()) {
      const verify = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
      if (!verify.success) {
        return NextResponse.json(
          {
            error: 'Bot challenge failed',
            errorCode: 'TURNSTILE_REQUIRED',
            reason: verify.reason,
            requestId,
          },
          {
            status: 403,
            headers: {
              ...corsHeaders,
              'x-request-id': requestId,
            },
          }
        );
      }
    }
    // First successful turn: stamp a verification flag so subsequent turns skip
    // the gate even if the client forgets to send the token. (We intentionally
    // don't persist this in Redis yet — the session-lifetime rate limiter
    // already enforces a 20-turn cap per cookie, and the cookie itself carries
    // signed trust forward. PR 2 may add a Redis flag when the LLM call goes
    // live and we want a stricter "second turn requires not-yet-elapsed
    // verification" rule.)
  }

  // --- Rate limits: IP + ASN + session ---
  const rate = await checkAnonymousChatRateLimit({ ip, sessionId, asn });
  if (!rate.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: rate.reason,
        errorCode: 'RATE_LIMITED',
        requestId,
      },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          ...createRateLimitHeaders(rate),
          'x-request-id': requestId,
        },
      }
    );
  }

  // PR 1 scope ends here. PR 2 will replace this 501 with the actual
  // executeChatTurn dispatch (Haiku-forced, onboarding tools wired in).
  const response = NextResponse.json(
    {
      error: 'Onboarding chat not yet implemented',
      message:
        'Onboarding chat infrastructure landed in JOV-2132 PR 1; LLM tools land in PR 2.',
      errorCode: 'NOT_IMPLEMENTED',
      sessionId,
      requestId,
    },
    {
      status: 501,
      headers: {
        ...corsHeaders,
        'x-request-id': requestId,
      },
    }
  );

  if (mintedSessionCookie) {
    response.cookies.set(ONBOARDING_SESSION_COOKIE_NAME, mintedSessionCookie, {
      httpOnly: true,
      secure: isSecureEnv(),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  Sentry.addBreadcrumb({
    category: 'onboarding-chat',
    message: 'anonymous_request_handled',
    level: 'info',
    data: { sessionMinted: !existingSessionId, asnPresent: Boolean(asn) },
  });

  return response;
}

function parseCookieHeader(header: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) {
      map.set(name, decodeURIComponent(value));
    }
  }
  return map;
}

/** Exported for the Redis verification flag key prefix used in PR 2 follow-ups. */
export { TURNSTILE_VERIFIED_FLAG_PREFIX };
