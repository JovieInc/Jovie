import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { recordShippedFixDeploys } from '@/lib/recovery/probes.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Boot-triggered release event for recovery emails (JOV-12766).
 *
 * instrumentation.ts fires this once per production lambda boot: on Vercel a
 * lambda boots only when the new deployment first serves traffic, so boot is
 * the release event. The stamp itself is idempotent (setIfAbsent) and never
 * runs on the /api/health/build-info request path — that public receipt is
 * read by monitors on every probe and must not touch the database.
 *
 * The boot hook reaches this route with a fetch instead of importing
 * probes.server into instrumentation.ts: instrumentation is bundled into
 * EVERY serverless function, so importing the recovery chain there traces the
 * whole database dependency graph (drizzle-orm, @neondatabase/serverless, ws,
 * the full schema barrel) into every function and pushed auth/ios/complete
 * past Vercel's 250 MB uncompressed-function-size limit. The graph lives only
 * in this route's own function.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/internal/ovie/fix-deploy-stamp',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;
  await recordShippedFixDeploys();
  return NextResponse.json(
    { contract: 'fix-deploy-stamp/v1', stamped: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
