import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Health check endpoint for homepage dependencies.
 * The marketing homepage is now fully static, so this endpoint only
 * reports the static homepage status without any runtime database checks.
 */
export async function GET() {
  const startTime = Date.now();
  const health = {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    checks: {
      staticHomepage: {
        status: 'healthy' as const,
        duration: Date.now() - startTime,
        mode: 'static',
      },
    },
  };

  return NextResponse.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
