import { NextResponse } from 'next/server';
import { runDogfoodTmpCleanup } from '@/lib/accounts/dogfood-tmp-cleanup';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { captureError } from '@/lib/error-tracking';
import { invalidateHandleCache } from '@/lib/onboarding/handle-availability-cache';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/cron/cleanup-dogfood-accounts';

/** Cron-secret gate; the denial keeps verifyCronRequest's status and body. */
const cronAccess: AccessPolicy<null> = {
  name: 'cron',
  async authorize(request) {
    const failure = verifyCronRequest(request, { route: ROUTE });
    if (!failure) return { ok: true, auth: null };
    return { ok: false, status: failure.status, body: await failure.json() };
  },
};

/**
 * Removes ephemeral founder dogfood accounts (`+dogfood-tmp-<id>`) older than
 * seven days. Cron-secret guarded. Dry run unless `?apply=1`; the report is
 * counts and redacted tmp ids only. Long-lived dogfood accounts never match.
 */
export const GET = defineRoute(
  { route: ROUTE, access: cronAccess },
  async ({ request, responseHeaders }) => {
    const apply = request.nextUrl.searchParams.get('apply') === '1';
    try {
      const report = await runDogfoodTmpCleanup(
        {
          atomic: fn =>
            runAtomicDbOperation(fn, {
              actorId: 'jovie-dogfood-tmp-cleanup',
              system: true,
              retry: 'never',
            }),
        },
        {
          apply,
          // Same cache busting as account deletion: freed handles show as
          // available and removed profiles stop serving.
          afterRemoval: async handles => {
            for (const handle of handles) {
              await invalidateHandleCache(handle);
              await invalidateProfileCache(handle);
            }
          },
        }
      );
      logger.info('Dogfood tmp account cleanup complete', {
        mode: report.mode,
        matched: report.matched,
        removed: report.removed,
      });
      return NextResponse.json(
        { success: true, ...report },
        { status: 200, headers: responseHeaders }
      );
    } catch (error) {
      await captureError('Dogfood tmp account cleanup failed', error, {
        route: ROUTE,
      });
      return NextResponse.json(
        { success: false, error: 'cleanup_failed' },
        { status: 500, headers: responseHeaders }
      );
    }
  }
);
