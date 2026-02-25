#!/usr/bin/env tsx

import { and, between, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const creatorProfileId = process.argv[2];

  if (creatorProfileId && !UUID_REGEX.test(creatorProfileId)) {
    console.error('Invalid creatorProfileId argument (expected UUID).');
    process.exit(1);
  }

  const baseWhere = and(
    eq(discogReleases.releaseType, 'single'),
    between(discogReleases.totalTracks, 4, 6),
    drizzleSql`EXISTS (
      SELECT 1
      FROM provider_links pl
      WHERE pl.release_id = ${discogReleases.id}
        AND pl.provider_id = 'spotify'
    )`
  );

  const whereClause = creatorProfileId
    ? and(baseWhere, eq(discogReleases.creatorProfileId, creatorProfileId))
    : baseWhere;

  const [before] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(discogReleases)
    .where(whereClause);

  if (!before || before.count === 0) {
    console.log('No matching single releases found for EP backfill.');
    return;
  }

  const updatedRows = await db
    .update(discogReleases)
    .set({
      releaseType: 'ep',
      updatedAt: new Date(),
    })
    .where(whereClause)
    .returning({ id: discogReleases.id });

  console.log(
    `Updated ${updatedRows.length} release(s) from single -> ep${
      creatorProfileId ? ` for profile ${creatorProfileId}` : ''
    }.`
  );
}

void main().catch(error => {
  console.error('EP backfill failed:', error);
  process.exit(1);
});
