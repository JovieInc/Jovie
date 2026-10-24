#!/usr/bin/env tsx
/** JOVIE-WEB-W3 credit Spotify id backfill. Dry run unless --apply. */
import { db } from '@/lib/db';
import {
  type BackfillDb,
  runCreditSpotifyIdBackfill,
} from '@/lib/discography/credit-spotify-id-backfill-runner';

void runCreditSpotifyIdBackfill(db as unknown as BackfillDb, {
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
