import 'server-only';

import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  type DogfoodTmpCleanupReport,
  runDogfoodTmpCleanup,
  type TestAccountCleanupFamily,
} from './dogfood-tmp-cleanup';

const FAMILIES: readonly TestAccountCleanupFamily[] = [
  'dogfood-tmp',
  'prodcert-run',
];

/**
 * Daily count of expired test accounts per family, as a dry run. Removal
 * stays on `/api/cron/cleanup-dogfood-accounts?family=<family>&apply=1`, so
 * the daily job only reports how many are due and never deletes on its own.
 */
export async function reportExpiredTestAccounts(): Promise<
  Record<TestAccountCleanupFamily, Omit<DogfoodTmpCleanupReport, 'sample'>>
> {
  const out = {} as Record<
    TestAccountCleanupFamily,
    Omit<DogfoodTmpCleanupReport, 'sample'>
  >;
  for (const family of FAMILIES) {
    const { sample: _sample, ...report } = await runDogfoodTmpCleanup(
      {
        atomic: fn =>
          runAtomicDbOperation(fn, {
            actorId: 'jovie-test-account-cleanup-report',
            system: true,
            retry: 'never',
          }),
      },
      { apply: false, family, sampleSize: 0 }
    );
    out[family] = report;
  }
  return out;
}
