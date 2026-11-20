#!/usr/bin/env tsx
/**
 * Unpublish leftover test/e2e/golden-path profiles and release their pool
 * bindings. Dry run unless --apply. Never deletes users or rows.
 *   doppler run -p jovie-web -c prd -- pnpm --filter @jovie/web exec tsx scripts/cleanup-test-profiles.ts [--apply]
 */
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  runTestProfileCleanup,
  type TestProfileCleanupDb,
} from '@/lib/profile/test-profile-cleanup';

const cleanupDb: TestProfileCleanupDb = {
  atomic: fn =>
    runAtomicDbOperation(
      tx =>
        fn({
          execute: query =>
            (tx as unknown as typeof db).execute(query) as unknown as Promise<{
              rows: Record<string, unknown>[];
            }>,
        }),
      {
        actorId: 'jovie-test-profile-cleanup',
        system: true,
        retry: 'never',
      }
    ),
};

void runTestProfileCleanup(cleanupDb, {
  apply: process.argv.includes('--apply'),
})
  .then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Test profile cleanup failed:', error);
    process.exit(1);
  });
