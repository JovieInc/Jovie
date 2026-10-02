/**
 * First-touch envelope capture at the public boundary (JOV-5036).
 *
 * Called from the proxy on GET/HEAD navigations. First-touch-wins: a valid,
 * unexpired `jovie_first_touch` cookie is never overwritten by a later
 * touch, so the earliest observed landing survives OAuth/OTP round-trips,
 * waitlist admission, and abandoned-and-returning sessions. The cookie is
 * session-bound only in the sense that it is an HttpOnly first-party cookie
 * — no fingerprinting, no third-party storage.
 */

import type { NextRequest, NextResponse } from 'next/server';
import {
  buildFirstTouch,
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_TTL_MS,
  openFirstTouchEnvelope,
  sealFirstTouchEnvelope,
} from './first-touch-envelope';

/**
 * Set the signed first-touch cookie on `response` when the request carries
 * no valid envelope. Never throws: attribution capture must not break
 * navigation, auth, or activation.
 */
export async function captureFirstTouchEnvelope(
  req: NextRequest,
  response: NextResponse
): Promise<void> {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    if (req.nextUrl.pathname.startsWith('/api/')) return;

    const existing = req.cookies.get(FIRST_TOUCH_COOKIE)?.value;
    if (await openFirstTouchEnvelope(existing)) return;

    const sealed = await sealFirstTouchEnvelope(
      buildFirstTouch({
        url: req.nextUrl,
        referer: req.headers.get('referer'),
      })
    );
    if (!sealed) return; // No signing secret configured — capture disabled.

    response.cookies.set(FIRST_TOUCH_COOKIE, sealed, {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(FIRST_TOUCH_TTL_MS / 1000),
    });
  } catch {
    // Best-effort capture: never surface attribution failures to the request.
  }
}
