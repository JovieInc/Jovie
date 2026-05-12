#!/usr/bin/env tsx

/**
 * Surface (and optionally soft-delete) duplicate active social_links rows.
 *
 * Background: the profile preview can render duplicate platform rows (e.g.
 * three YouTube rows on Tim's profile, JOV-2149) because legacy ingestion
 * paths can insert rows with the same (creator_profile_id, platform, url)
 * tuple. Migration 0046 is now self-healing (it soft-deletes duplicates
 * within the migration itself), so this script is no longer required as
 * a pre-step. It remains useful for ad-hoc dry-run inspection.
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/audit-duplicate-social-links.ts
 *     # prints duplicate groups; no mutations.
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/audit-duplicate-social-links.ts --apply
 *     # marks all-but-one row per duplicate group as is_active=false,
 *     # state='inactive'. Original rows are preserved for forensic review.
 *
 * Strategy:
 *  - Group active rows by (creator_profile_id, platform, lower(url)).
 *  - Within each group, keep the row with the most recent updated_at
 *    (ties broken by created_at, then id). Soft-delete the rest.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

interface DuplicateRow {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly platform: string;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface DuplicateGroup {
  readonly creatorProfileId: string;
  readonly platform: string;
  readonly normUrl: string;
  readonly rows: DuplicateRow[];
}

async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await db.execute<{
    creator_profile_id: string;
    platform: string;
    norm_url: string;
    id: string;
    url: string;
    created_at: string;
    updated_at: string;
  }>(drizzleSql`
    WITH dupes AS (
      SELECT creator_profile_id, platform, lower(url) AS norm_url
      FROM social_links
      WHERE is_active = true AND state = 'active'
      GROUP BY 1, 2, 3
      HAVING count(*) > 1
    )
    SELECT
      sl.id,
      sl.creator_profile_id,
      sl.platform,
      lower(sl.url) AS norm_url,
      sl.url,
      sl.created_at,
      sl.updated_at
    FROM social_links sl
    JOIN dupes d
      ON d.creator_profile_id = sl.creator_profile_id
     AND d.platform = sl.platform
     AND d.norm_url = lower(sl.url)
    WHERE sl.is_active = true AND sl.state = 'active'
    ORDER BY sl.creator_profile_id, sl.platform, lower(sl.url),
             sl.updated_at DESC, sl.created_at DESC, sl.id;
  `);

  const groupKey = (r: {
    creator_profile_id: string;
    platform: string;
    norm_url: string;
  }) => `${r.creator_profile_id}|${r.platform}|${r.norm_url}`;

  const byKey = new Map<string, DuplicateGroup>();
  for (const r of rows.rows) {
    const key = groupKey(r);
    const row: DuplicateRow = {
      id: r.id,
      creatorProfileId: r.creator_profile_id,
      platform: r.platform,
      url: r.url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
    const group = byKey.get(key);
    if (group) {
      (group.rows as DuplicateRow[]).push(row);
    } else {
      byKey.set(key, {
        creatorProfileId: r.creator_profile_id,
        platform: r.platform,
        normUrl: r.norm_url,
        rows: [row],
      });
    }
  }
  return Array.from(byKey.values());
}

function pickIdsToSoftDelete(group: DuplicateGroup): string[] {
  // Rows are already sorted updated_at DESC, created_at DESC, id ASC.
  // Keep the first (most recent), soft-delete the rest.
  return group.rows.slice(1).map(r => r.id);
}

async function softDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(drizzleSql`
    UPDATE social_links
       SET is_active = false,
           state = 'inactive',
           updated_at = now()
     WHERE id = ANY(${ids}::uuid[])
  `);
}

async function main(): Promise<void> {
  const groups = await findDuplicateGroups();

  if (groups.length === 0) {
    console.log('No duplicate (creator, platform, lower(url)) groups found.');
    return;
  }

  let totalRowsToRemove = 0;
  console.log(`Found ${groups.length} duplicate group(s):\n`);
  for (const g of groups) {
    const ids = pickIdsToSoftDelete(g);
    totalRowsToRemove += ids.length;
    console.log(
      `  creator=${g.creatorProfileId} platform=${g.platform} url=${g.normUrl}`
    );
    console.log(
      `    kept: ${g.rows[0]?.id} (updated_at=${g.rows[0]?.updatedAt})`
    );
    for (const id of ids) {
      const r = g.rows.find(x => x.id === id);
      console.log(`    soft-delete: ${id} (updated_at=${r?.updatedAt})`);
    }
  }

  console.log(
    `\nSummary: ${groups.length} groups, ${totalRowsToRemove} rows would be soft-deleted.`
  );

  if (!APPLY) {
    console.log('\nDry run — pass --apply to perform the soft-delete.');
    return;
  }

  console.log('\nApplying soft-delete…');
  const allIds = groups.flatMap(pickIdsToSoftDelete);
  await softDelete(allIds);
  console.log(`Done. Soft-deleted ${allIds.length} row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
