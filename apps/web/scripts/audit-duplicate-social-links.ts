#!/usr/bin/env tsx

/**
 * Surface (and optionally soft-delete) duplicate active social_links rows.
 *
 * Background: the profile preview can render duplicate platform rows (e.g.
 * three YouTube rows on Tim's profile, JOV-2149) because legacy ingestion
 * paths can insert rows with the same (creator_profile_id, platform, url)
 * tuple. The render layer now dedupes defensively (ProfileLinkList.tsx),
 * and migration 0046 adds a partial unique index gated on
 * `normalize_social_url(url)`.
 *
 * The migration is self-cleaning: it soft-deletes pre-existing duplicates
 * inline before creating the unique index. This script is therefore
 * OPTIONAL — useful for previewing what the migration would touch, or for
 * forensic post-migration audits.
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/audit-duplicate-social-links.ts
 *     # prints duplicate groups; no mutations.
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/audit-duplicate-social-links.ts --apply
 *     # marks all-but-one row per duplicate group as is_active=false,
 *     # state='rejected'. Original rows are preserved for forensic review.
 *     # ('rejected' matches the canonical soft-delete state used by
 *     # `app/api/dashboard/social-links DELETE`; the social_link_state
 *     # enum has no 'inactive' member.)
 *
 * Strategy:
 *  - Group active rows by (creator_profile_id, platform,
 *    normalize_social_url(url)) — same expression as the unique index.
 *  - Within each group, keep the row with the most recent updated_at
 *    (ties broken by created_at, then id). Soft-delete the rest.
 */

import { and, asc, desc, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';

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

/**
 * Find duplicate active social_links rows using Drizzle query composition.
 *
 * Strategy: select all active rows with their normalized URL (using the
 * `normalize_social_url()` DB function from migration 0046), then group
 * client-side and discard groups of size 1. This avoids a CTE/HAVING
 * pattern that Drizzle's builder doesn't express cleanly while keeping
 * the column projection type-safe and aligned with the schema.
 *
 * The single `drizzleSql` fragment is the normalization expression — it
 * must match the index in 0046 exactly (which itself mirrors
 * `lib/utils/social-platform.ts` `dedupeKey`). Per coding guidelines, we
 * minimize raw SQL to that single expression rather than hand-rolling
 * the entire query as a template.
 */
async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const normUrl = drizzleSql<string>`normalize_social_url(${socialLinks.url})`;

  const rows = await db
    .select({
      id: socialLinks.id,
      creatorProfileId: socialLinks.creatorProfileId,
      platform: socialLinks.platform,
      normUrl,
      url: socialLinks.url,
      createdAt: socialLinks.createdAt,
      updatedAt: socialLinks.updatedAt,
    })
    .from(socialLinks)
    .where(and(eq(socialLinks.isActive, true), eq(socialLinks.state, 'active')))
    .orderBy(
      asc(socialLinks.creatorProfileId),
      asc(socialLinks.platform),
      asc(normUrl),
      desc(socialLinks.updatedAt),
      desc(socialLinks.createdAt),
      asc(socialLinks.id)
    );

  const groupKey = (r: {
    creatorProfileId: string;
    platform: string;
    normUrl: string;
  }) => `${r.creatorProfileId}|${r.platform}|${r.normUrl}`;

  const byKey = new Map<string, DuplicateGroup>();
  for (const r of rows) {
    const key = groupKey(r);
    const row: DuplicateRow = {
      id: r.id,
      creatorProfileId: r.creatorProfileId,
      platform: r.platform,
      url: r.url,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      updatedAt:
        r.updatedAt instanceof Date
          ? r.updatedAt.toISOString()
          : String(r.updatedAt),
    };
    const group = byKey.get(key);
    if (group) {
      (group.rows as DuplicateRow[]).push(row);
    } else {
      byKey.set(key, {
        creatorProfileId: r.creatorProfileId,
        platform: r.platform,
        normUrl: r.normUrl,
        rows: [row],
      });
    }
  }
  // Only keep groups with more than one row (the actual duplicates).
  return Array.from(byKey.values()).filter(g => g.rows.length > 1);
}

function pickIdsToSoftDelete(group: DuplicateGroup): string[] {
  // Rows are already sorted updated_at DESC, created_at DESC, id ASC.
  // Keep the first (most recent), soft-delete the rest.
  return group.rows.slice(1).map(r => r.id);
}

async function softDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Type-safe Drizzle update with inArray() — replaces the previous raw
  // SQL `UPDATE ... WHERE id = ANY($ids::uuid[])` template per coding
  // guidelines: prefer Drizzle ORM query composition over raw SQL.
  await db
    .update(socialLinks)
    .set({
      isActive: false,
      // 'rejected' is the canonical soft-delete state (see
      // app/api/dashboard/social-links DELETE). The social_link_state
      // enum is ['active','suggested','rejected'] — no 'inactive' member.
      state: 'rejected',
      updatedAt: new Date(),
    })
    .where(inArray(socialLinks.id, ids));
}

async function main(): Promise<void> {
  const groups = await findDuplicateGroups();

  if (groups.length === 0) {
    console.log(
      'No duplicate (creator, platform, normalize_social_url(url)) groups found.'
    );
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
