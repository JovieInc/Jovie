import { NextResponse } from 'next/server';

/**
 * GET /api/version
 *
 * Returns the current build identifier so clients can detect when a new
 * deployment has been pushed. Used by the web Update pill (useWebUpdate hook).
 *
 * Intentionally unauthenticated and cheap — no DB access, no rate limiting.
 * Cache-Control: no-store ensures each poll sees the live value.
 */
export function GET() {
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    'dev';

  return NextResponse.json(
    { buildId },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
