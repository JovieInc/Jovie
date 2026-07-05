#!/usr/bin/env -S tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Audit and optionally delete synthetic/seed audience analytics rows.
 *
 * Default is dry-run. Use --execute to delete matched rows.
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/cleanup-synthetic-audience.ts
 *
 *   doppler run --project jovie-web --config prd -- \
 *     pnpm tsx apps/web/scripts/cleanup-synthetic-audience.ts --username tim --execute
 */

import { neon } from '@neondatabase/serverless';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';
import {
  audienceMembers,
  clickEvents,
  dailyProfileViews,
} from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { assertSeedDatabaseTarget } from './seed-database-guard';
import {
  syntheticAudienceMemberWhere,
  syntheticClickEventWhere,
} from './synthetic-audience-markers';

interface CliOptions {
  readonly username?: string;
  readonly profileId?: string;
  readonly execute: boolean;
  readonly includeViews: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let username: string | undefined;
  let profileId: string | undefined;
  let execute = false;
  let includeViews = false;

  for (const arg of argv) {
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--include-views') {
      includeViews = true;
      continue;
    }
    if (arg.startsWith('--username=')) {
      username = arg.slice('--username='.length).trim().toLowerCase();
      continue;
    }
    if (arg.startsWith('--profile-id=')) {
      profileId = arg.slice('--profile-id='.length).trim();
    }
  }

  return { username, profileId, execute, includeViews };
}

async function resolveProfileId(
  db: ReturnType<typeof drizzle>,
  options: CliOptions
): Promise<string | undefined> {
  if (options.profileId) {
    return options.profileId;
  }

  if (!options.username) {
    return undefined;
  }

  const [profile] = await db
    .select({ id: creatorProfiles.id, username: creatorProfiles.username })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, options.username))
    .limit(1);

  if (!profile) {
    console.error(`❌ No profile found for username "${options.username}"`);
    process.exit(1);
  }

  console.log(`🎯 Scoped to @${profile.username} (${profile.id})`);
  return profile.id;
}

async function countRows(
  db: ReturnType<typeof drizzle>,
  table: 'audience_members' | 'click_events' | 'daily_profile_views',
  profileId?: string
): Promise<number> {
  if (table === 'audience_members') {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(audienceMembers)
      .where(syntheticAudienceMemberWhere(profileId));
    return row?.count ?? 0;
  }

  if (table === 'click_events') {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(clickEvents)
      .where(syntheticClickEventWhere(profileId));
    return row?.count ?? 0;
  }

  if (!profileId) {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(dailyProfileViews);
    return row?.count ?? 0;
  }

  const [row] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(dailyProfileViews)
    .where(eq(dailyProfileViews.creatorProfileId, profileId));
  return row?.count ?? 0;
}

async function sampleEncodedCities(
  db: ReturnType<typeof drizzle>,
  profileId?: string
): Promise<Array<{ geoCity: string | null; count: number }>> {
  const profileFilter = profileId
    ? drizzleSql`${audienceMembers.creatorProfileId} = ${profileId}`
    : drizzleSql`true`;

  return db
    .select({
      geoCity: audienceMembers.geoCity,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(audienceMembers)
    .where(
      drizzleSql`${profileFilter} AND ${audienceMembers.geoCity} LIKE ${'%\\%%'}`
    )
    .groupBy(audienceMembers.geoCity)
    .orderBy(drizzleSql`count(*) desc`)
    .limit(10);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not configured');
    process.exit(1);
  }

  if (options.execute) {
    assertSeedDatabaseTarget({
      scriptName: 'cleanup-synthetic-audience.ts',
    });
  } else {
    console.log('ℹ️  Dry-run mode (pass --execute to delete matched rows)');
  }

  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, { schema });
  const profileId = await resolveProfileId(db, options);

  const audienceCount = await countRows(db, 'audience_members', profileId);
  const clickCount = await countRows(db, 'click_events', profileId);
  const viewCount = options.includeViews
    ? await countRows(db, 'daily_profile_views', profileId)
    : 0;

  console.log('\nSynthetic audience blast radius');
  console.log(`  audience_members: ${audienceCount}`);
  console.log(`  click_events:     ${clickCount}`);
  if (options.includeViews) {
    console.log(
      `  daily_profile_views (profile-scoped, optional): ${viewCount}`
    );
  }

  const encodedCitySamples = await sampleEncodedCities(db, profileId);
  if (encodedCitySamples.length > 0) {
    console.log('\nTop URL-encoded geo_city values:');
    for (const sample of encodedCitySamples) {
      console.log(`  ${sample.geoCity ?? '(null)'}: ${sample.count}`);
    }
  }

  if (!options.execute) {
    console.log('\nNo rows deleted (dry-run).');
    return;
  }

  await db.delete(clickEvents).where(syntheticClickEventWhere(profileId));
  await db
    .delete(audienceMembers)
    .where(syntheticAudienceMemberWhere(profileId));

  if (options.includeViews && profileId) {
    await db
      .delete(dailyProfileViews)
      .where(eq(dailyProfileViews.creatorProfileId, profileId));
  }

  const audienceAfter = await countRows(db, 'audience_members', profileId);
  const clicksAfter = await countRows(db, 'click_events', profileId);

  console.log('\nDelete complete');
  console.log(`  audience_members removed: ${audienceCount - audienceAfter}`);
  console.log(`  click_events removed: ${clickCount - clicksAfter}`);
  if (options.includeViews && profileId) {
    const viewsAfter = await countRows(db, 'daily_profile_views', profileId);
    console.log(`  daily_profile_views removed: ${viewCount - viewsAfter}`);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ cleanup-synthetic-audience failed:', error);
      process.exit(1);
    });
}
