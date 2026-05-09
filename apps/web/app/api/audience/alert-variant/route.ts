/**
 * GET /api/audience/alert-variant
 *
 * Resolves the alert opt-in CTA variant (button | toggle) for a given
 * anonymous stable ID. Called client-side after hydration so the
 * /{username} page can be ISR-cached without reading the anon cookie
 * during server rendering.
 *
 * The stableId comes from the `jv_aid` cookie, which is read client-side
 * by ProfileCompactSurface and forwarded here.
 *
 * Returns `{ variant: 'button' | 'toggle' }`. Defaults to 'button' on
 * any error so the UI always renders a valid state.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { getProfileAlertOptInVariant } from '@/lib/flags/server';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // stableId may be absent (first-time visitors with no cookie set yet)
  const stableId = searchParams.get('stableId') ?? null;

  try {
    const variant = await getProfileAlertOptInVariant(stableId);
    return NextResponse.json({ variant }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    // Log for observability, but fail open so the UI is never broken.
    try {
      await captureError('Alert variant resolution failed', error, {
        stableId,
        route: '/api/audience/alert-variant',
      });
    } catch {
      // Best-effort telemetry — never let logging break the response.
    }
    return NextResponse.json(
      { variant: 'button' },
      { headers: NO_STORE_HEADERS }
    );
  }
}
