import { type NextRequest, NextResponse } from 'next/server';
import { runDogfoodTmpCleanup } from '@/lib/accounts/dogfood-tmp-cleanup';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { invalidateHandleCache } from '@/lib/onboarding/handle-availability-cache';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/cron/cleanup-dogfood-accounts';

/**
 * Removes ephemeral founder dogfood accounts (`+dogfood-tmp-<id>`) older than
 * seven days. Cron-secret guarded. Dry run unless `?apply=1`; the report is
 * counts and redacted tmp ids only. Long-lived dogfood accounts never match.
 */
export async function GET(request: NextRequest) {
  const failure = verifyCronRequest(request, { route: ROUTE });
  if (failure) return failure;

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
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Dogfood tmp account cleanup failed', error, {
      route: ROUTE,
    });
    return NextResponse.json(
      { success: false, error: 'cleanup_failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
