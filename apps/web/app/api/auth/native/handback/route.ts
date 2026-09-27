import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { redeemStoredDesktopHandback } from '@/lib/auth/routing-state.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  allowIfRateLimitBackendDegraded,
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Deep-link-independent desktop handback.
 *
 * When `jovie://auth/complete` cannot reach the Mac app, the return page
 * shows a short return code. The user types it into the app, which posts it
 * here with its flow nonce and PKCE verifier and receives the same
 * code/state pair the deep link would have carried. The code is still
 * single-use and PKCE-bound at `/api/auth/native/exchange`.
 *
 * Every failure answers the same 401 so the endpoint is not an oracle for
 * which flows exist.
 */

const DESKTOP_FLOW_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
// RFC 7636: 43-128 chars of [A-Za-z0-9-._~]. The app sends 86 base64url.
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

// Loose shape check only; the store normalizes spaces, dashes and case.
const RETURN_CODE_PATTERN = /^[A-Za-z\s-]{8,16}$/;

interface DesktopHandbackRequest {
  client?: unknown;
  desktopFlow?: unknown;
  codeVerifier?: unknown;
  returnCode?: unknown;
}

function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function POST(request: Request) {
  try {
    const rateLimit = allowIfRateLimitBackendDegraded(
      await generalLimiter.limit(
        `auth:desktop-handback:${getClientIP(request)}`
      ),
      { route: '/api/auth/native/handback' }
    );
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many handback attempts' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimit),
          },
        }
      );
    }

    const payload = (await request
      .json()
      .catch(() => ({}))) as DesktopHandbackRequest;
    if (
      payload.client !== 'electron' ||
      typeof payload.desktopFlow !== 'string' ||
      !DESKTOP_FLOW_PATTERN.test(payload.desktopFlow) ||
      typeof payload.codeVerifier !== 'string' ||
      !CODE_VERIFIER_PATTERN.test(payload.codeVerifier) ||
      typeof payload.returnCode !== 'string' ||
      !RETURN_CODE_PATTERN.test(payload.returnCode)
    ) {
      return NextResponse.json(
        { error: 'Invalid desktop handback request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await redeemStoredDesktopHandback({
      desktopFlow: payload.desktopFlow,
      codeVerifier: payload.codeVerifier,
      returnCode: payload.returnCode,
      createCodeChallenge,
    });

    if (result.status !== 'complete') {
      return NextResponse.json(
        { error: 'Invalid return code', status: 'invalid' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Desktop handback route failed', error, {
      route: '/api/auth/native/handback',
    });
    return NextResponse.json(
      { error: 'Desktop handback failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
