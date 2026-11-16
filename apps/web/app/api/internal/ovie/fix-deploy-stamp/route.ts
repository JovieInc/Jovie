import { NextResponse } from 'next/server';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';
import { verifyCronRequest } from '@/lib/cron/auth';
import { recordShippedFixDeploys } from '@/lib/recovery/probes.server';

export const runtime = 'nodejs';

/**
 * Same caller family as the cron routes: cron bearer + Jovie-owned host
 * origin (requireTrustedOrigin). instrumentation.ts cannot hold the cron
 * bearer itself, so it only fires the request; this policy proves it.
 */
const cronAccess: AccessPolicy<null> = {
  name: 'cron-bearer',
  async authorize(request) {
    const authError = verifyCronRequest(request, {
      route: '/api/internal/ovie/fix-deploy-stamp',
      requireTrustedOrigin: true,
    });
    return authError
      ? { ok: false, status: authError.status, body: { error: 'unauthorized' } }
      : { ok: true, auth: null };
  },
};

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
export const POST = defineRoute(
  {
    route: '/api/internal/ovie/fix-deploy-stamp',
    access: cronAccess,
    errorMessage: 'Failed to stamp shipped-fix deploy times',
  },
  async () => {
    await recordShippedFixDeploys();
    return NextResponse.json({
      contract: 'fix-deploy-stamp/v1',
      stamped: true,
    });
  }
);
