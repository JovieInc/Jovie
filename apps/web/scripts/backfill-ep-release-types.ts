#!/usr/bin/env tsx

import { and, between, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';

async function main() {
  const creatorProfileId = process.argv[2];

  const baseWhere = and(
    eq(discogReleases.releaseType, 'single'),
    between(discogReleases.totalTracks, 4, 6)
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
