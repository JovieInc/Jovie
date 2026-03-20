#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Re-enrich all existing artists via MusicFetch.
 *
 * Inserts musicfetch_enrichment jobs into ingestion_jobs for every
 * creator profile that has a Spotify URL or Spotify ID. Skips profiles
 * that already have a pending/processing enrichment job (dedup).
 *
 * Usage:
 *   doppler run -- npx tsx apps/web/scripts/reenrich-all-artists.ts
 *   doppler run -- npx tsx apps/web/scripts/reenrich-all-artists.ts --dry-run
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { and, inArray, isNotNull, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';

dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(
    isDryRun
      ? '🔍 DRY RUN — no jobs will be inserted\n'
      : '🚀 Re-enriching all artists via MusicFetch\n'
  );

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  // 1. Query all profiles with Spotify data
  const profiles = await db
    .select({
      id: schema.creatorProfiles.id,
      username: schema.creatorProfiles.username,
      displayName: schema.creatorProfiles.displayName,
      spotifyUrl: schema.creatorProfiles.spotifyUrl,
      spotifyId: schema.creatorProfiles.spotifyId,
    })
    .from(schema.creatorProfiles)
    .where(
      or(
        isNotNull(schema.creatorProfiles.spotifyUrl),
        isNotNull(schema.creatorProfiles.spotifyId)
      )
    );

  console.log(`Found ${profiles.length} profiles with Spotify data\n`);

  let enqueued = 0;
  let skipped = 0;
  let noUrl = 0;

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];

    // Resolve Spotify URL
    const spotifyUrl =
      profile.spotifyUrl ||
      (profile.spotifyId
        ? `https://open.spotify.com/artist/${profile.spotifyId}`
        : null);

    if (!spotifyUrl) {
      console.log(`⚠️  ${profile.username} — no Spotify URL or ID, skipping`);
      noUrl++;
      continue;
    }

    // 2. Dedup check: skip if pending/processing job exists
    const dedupKey = `musicfetch_enrichment:${profile.id}`;
    const existing = await db
      .select({ id: schema.ingestionJobs.id })
      .from(schema.ingestionJobs)
      .where(
        and(
          like(schema.ingestionJobs.dedupKey, `${dedupKey}%`),
          inArray(schema.ingestionJobs.status, ['pending', 'processing'])
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(
        `⏭️  ${profile.username} — pending/processing job exists, skipping`
      );
      skipped++;
      continue;
    }

    // Stagger run_at by 10s per job to respect 6 req/min rate limit
    const runAt = new Date(Date.now() + enqueued * 10_000);
    const timestampedDedupKey = `${dedupKey}:${Date.now()}`;

    if (isDryRun) {
      console.log(
        `📋 Would enqueue: ${profile.displayName || profile.username} (${profile.id}) — run_at ${runAt.toISOString()}`
      );
    } else {
      await db.insert(schema.ingestionJobs).values({
        jobType: 'musicfetch_enrichment',
        payload: {
          creatorProfileId: profile.id,
          spotifyUrl,
          dedupKey: timestampedDedupKey,
        },
        status: 'pending',
        priority: 1,
        runAt,
        dedupKey: timestampedDedupKey,
        attempts: 0,
      });
      console.log(
        `✅ Enqueued: ${profile.displayName || profile.username} — run_at ${runAt.toISOString()}`
      );
    }

    enqueued++;
  }

  console.log(`\n🎉 ${isDryRun ? 'Dry run' : 'Re-enrichment'} complete!`);
  console.log(`   ✅ Enqueued: ${enqueued}`);
  console.log(`   ⏭️  Skipped (dedup): ${skipped}`);
  console.log(`   ⚠️  Skipped (no URL): ${noUrl}`);
  console.log(`   📊 Total profiles: ${profiles.length}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}
