#!/usr/bin/env -S tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Unpublish leftover claimed placeholder identities on production (JOV-6464).
 *
 * The JOV-6260 directory/sitemap guard stops placeholder identities
 * (displayName === handle, or empty displayName) from appearing in public
 * catalogs, but rows that were already claimed still serve their direct
 * profile URL. This script is the reviewed, auditable path to set
 * `is_public = false` on those rows — not ad-hoc SQL from an agent session.
 *
 * The built-in allowlist covers the confirmed leftovers: `hello`, `ti89m`,
 * `tim1`, and `timwhite1` (whose displayName `timwhite` differs from the
 * handle and so is not caught by the displayName===handle predicate).
 * Additional confirmed handles can be passed with repeated `--handle=`.
 *
 * Only claimed, currently-public rows matching the allowlist are touched.
 * The scan afterwards reports other claimed public identities that match the
 * placeholder shape so an operator can confirm them before re-running with
 * `--handle=` — nothing outside the allowlist is ever mutated.
 *
 * Default is dry-run. Use --execute to unpublish matched rows.
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/unpublish-placeholder-identities.ts
 *
 *   doppler run --project jovie-web --config prd -- \
 *     ALLOW_PRODUCTION_SEED=1 pnpm tsx apps/web/scripts/unpublish-placeholder-identities.ts --execute
 */

import { neon } from '@neondatabase/serverless';
import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { assertSeedDatabaseTarget } from './seed-database-guard';

export const PLACEHOLDER_IDENTITY_HANDLES = [
  'hello',
  'ti89m',
  'tim1',
  'timwhite1',
] as const;

export interface PlaceholderProfileRow {
  readonly id: string;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly displayName: string | null;
  readonly isPublic: boolean | null;
  readonly isClaimed: boolean | null;
}

export interface PlaceholderUnpublishPlan {
  /** Claimed, currently-public rows the run will unpublish. */
  readonly unpublish: readonly PlaceholderProfileRow[];
  /** Matched rows skipped because they are already private. */
  readonly alreadyPrivate: readonly PlaceholderProfileRow[];
  /** Matched rows skipped because they are not claimed. */
  readonly unclaimed: readonly PlaceholderProfileRow[];
  /** Requested handles with no matching profile row at all. */
  readonly missingHandles: readonly string[];
}

export function planPlaceholderUnpublish(
  rows: readonly PlaceholderProfileRow[],
  handles: readonly string[]
): PlaceholderUnpublishPlan {
  const wanted = new Set(handles);
  const unpublish: PlaceholderProfileRow[] = [];
  const alreadyPrivate: PlaceholderProfileRow[] = [];
  const unclaimed: PlaceholderProfileRow[] = [];

  for (const row of rows) {
    if (!wanted.has(row.usernameNormalized)) continue;
    if (row.isClaimed !== true) {
      unclaimed.push(row);
    } else if (row.isPublic === true) {
      unpublish.push(row);
    } else {
      alreadyPrivate.push(row);
    }
  }

  const found = new Set(rows.map(row => row.usernameNormalized));
  const missingHandles = handles.filter(handle => !found.has(handle));

  return { unpublish, alreadyPrivate, unclaimed, missingHandles };
}

interface CliOptions {
  readonly execute: boolean;
  readonly handles: readonly string[];
}

function parseArgs(argv: string[]): CliOptions {
  let execute = false;
  const extraHandles: string[] = [];

  for (const arg of argv) {
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg.startsWith('--handle=')) {
      const handle = arg.slice('--handle='.length).trim().toLowerCase();
      if (handle) extraHandles.push(handle);
    }
  }

  const handles = [
    ...new Set([...PLACEHOLDER_IDENTITY_HANDLES, ...extraHandles]),
  ];
  return { execute, handles };
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
      scriptName: 'unpublish-placeholder-identities.ts',
    });
  } else {
    console.log('ℹ️  Dry-run mode (pass --execute to unpublish matched rows)');
  }

  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, { schema });

  const rows = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.usernameNormalized, [...options.handles]));

  const plan = planPlaceholderUnpublish(rows, options.handles);

  console.log('\nPlaceholder identity unpublish plan');
  console.log(`  target handles: ${options.handles.join(', ')}`);
  for (const row of plan.unpublish) {
    console.log(
      `  UNPUBLISH @${row.username} (${row.id}, displayName=${row.displayName ?? 'null'})`
    );
  }
  for (const row of plan.alreadyPrivate) {
    console.log(`  SKIP already private @${row.username} (${row.id})`);
  }
  for (const row of plan.unclaimed) {
    console.log(`  SKIP unclaimed @${row.username} (${row.id})`);
  }
  for (const handle of plan.missingHandles) {
    console.log(`  MISS no profile row for handle "${handle}"`);
  }

  if (options.execute && plan.unpublish.length > 0) {
    await db
      .update(creatorProfiles)
      .set({ isPublic: false, updatedAt: new Date() })
      .where(
        and(
          inArray(
            creatorProfiles.id,
            plan.unpublish.map(row => row.id)
          ),
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isClaimed, true)
        )
      );
    console.log(`\nUnpublished ${plan.unpublish.length} profile(s).`);
  } else if (!options.execute) {
    console.log('\nNo rows updated (dry-run).');
  }

  // Report other claimed public placeholder-shaped identities for operator
  // review. These are never mutated by this script.
  const candidates = await db
    .select({
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .where(
      drizzleSql`
        ${creatorProfiles.isPublic} = true
        AND ${creatorProfiles.isClaimed} = true
        AND (
          coalesce(${creatorProfiles.displayName}, '') = ''
          OR lower(${creatorProfiles.displayName}) = ${creatorProfiles.usernameNormalized}
        )
      `
    )
    .orderBy(creatorProfiles.usernameNormalized)
    .limit(100);

  const remaining = candidates.filter(
    row => !plan.unpublish.some(target => target.username === row.username)
  );
  if (remaining.length > 0) {
    console.log(
      '\nOther claimed public placeholder-shaped identities (review only):'
    );
    for (const row of remaining) {
      console.log(
        `  @${row.username} (displayName=${row.displayName ?? 'null'}) — rerun with --handle=${row.usernameNormalized} after confirming`
      );
    }
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ unpublish-placeholder-identities failed:', error);
      process.exit(1);
    });
}
