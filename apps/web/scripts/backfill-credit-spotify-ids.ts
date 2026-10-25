#!/usr/bin/env tsx
/** JOVIE-WEB-W3 credit Spotify id backfill. Dry run unless --apply. */
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  type BackfillDb,
  runCreditSpotifyIdBackfill,
} from '@/lib/discography/credit-spotify-id-backfill-runner';

const backfillDb: BackfillDb = {
  execute: query =>
    db.execute(query) as unknown as ReturnType<BackfillDb['execute']>,
  atomic: fn =>
    runAtomicDbOperation(
      tx => fn(tx as unknown as Pick<BackfillDb, 'execute'>),
      {
        actorId: 'jovie-web-w3-credit-spotify-id-backfill',
        system: true,
        retry: 'never',
      }
    ),
};

void runCreditSpotifyIdBackfill(backfillDb, {
  apply: process.argv.includes('--apply'),
})
  .then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Credit Spotify id backfill failed:', error);
    process.exit(1);
  });
