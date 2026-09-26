#!/usr/bin/env -S tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Unpublish leftover claimed placeholder identities on production (JOV-6464).
 * Sets `is_public = false` on claimed public rows matching the built-in
 * allowlist (plus repeated `--handle=`); nothing else is mutated. The scan
 * afterwards reports other claimed public placeholder-shaped identities for
 * review. Dry-run by default; `--execute` requires the seed-database guard.
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

export interface PlaceholderCandidateRow {
  readonly username: string;
  readonly usernameNormalized: string;
  readonly displayName: string | null;
}

export interface PlaceholderUnpublishPlan {
  readonly unpublish: readonly PlaceholderProfileRow[];
  readonly alreadyPrivate: readonly PlaceholderProfileRow[];
  readonly unclaimed: readonly PlaceholderProfileRow[];
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

export interface CliOptions {
  readonly execute: boolean;
  readonly handles: readonly string[];
}

export function parseArgs(argv: readonly string[]): CliOptions {
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

export interface PlaceholderUnpublishDeps {
  readonly loadRows: (
    handles: readonly string[]
  ) => Promise<readonly PlaceholderProfileRow[]>;
  readonly unpublish: (ids: readonly string[]) => Promise<unknown>;
  readonly loadCandidates: () => Promise<readonly PlaceholderCandidateRow[]>;
  readonly log: (message: string) => void;
}

export async function runPlaceholderUnpublish(
  options: CliOptions,
  deps: PlaceholderUnpublishDeps
): Promise<PlaceholderUnpublishPlan> {
  const rows = await deps.loadRows(options.handles);
  const plan = planPlaceholderUnpublish(rows, options.handles);

  deps.log('\nPlaceholder identity unpublish plan');
  deps.log(`  target handles: ${options.handles.join(', ')}`);
  for (const row of plan.unpublish) {
    deps.log(
      `  UNPUBLISH @${row.username} (${row.id}, displayName=${row.displayName ?? 'null'})`
    );
  }
  for (const row of plan.alreadyPrivate) {
    deps.log(`  SKIP already private @${row.username} (${row.id})`);
  }
  for (const row of plan.unclaimed) {
    deps.log(`  SKIP unclaimed @${row.username} (${row.id})`);
  }
  for (const handle of plan.missingHandles) {
    deps.log(`  MISS no profile row for handle "${handle}"`);
  }

  if (options.execute && plan.unpublish.length > 0) {
    await deps.unpublish(plan.unpublish.map(row => row.id));
    deps.log(`\nUnpublished ${plan.unpublish.length} profile(s).`);
  } else if (!options.execute) {
    deps.log('\nNo rows updated (dry-run).');
  }

  // Report (never mutate) other claimed public placeholder-shaped identities.
  const candidates = await deps.loadCandidates();
  const remaining = candidates.filter(
    row => !plan.unpublish.some(target => target.username === row.username)
  );
  if (remaining.length > 0) {
    deps.log(
      '\nOther claimed public placeholder-shaped identities (review only):'
    );
    for (const row of remaining) {
      deps.log(
        `  @${row.username} (displayName=${row.displayName ?? 'null'}) — rerun with --handle=${row.usernameNormalized} after confirming`
      );
    }
  }

  return plan;
}

export async function runCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<PlaceholderUnpublishPlan> {
  const options = parseArgs(argv);
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  if (options.execute) {
    assertSeedDatabaseTarget({
      scriptName: 'unpublish-placeholder-identities.ts',
    });
  } else {
    console.log('ℹ️  Dry-run mode (pass --execute to unpublish matched rows)');
  }

  const db = drizzle(neon(databaseUrl), { schema });

  return runPlaceholderUnpublish(options, {
    log: console.log,
    loadRows: handles =>
      db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          usernameNormalized: creatorProfiles.usernameNormalized,
          displayName: creatorProfiles.displayName,
          isPublic: creatorProfiles.isPublic,
          isClaimed: creatorProfiles.isClaimed,
        })
        .from(creatorProfiles)
        .where(inArray(creatorProfiles.usernameNormalized, [...handles])),
    unpublish: ids =>
      db
        .update(creatorProfiles)
        .set({ isPublic: false, updatedAt: new Date() })
        .where(
          and(
            inArray(creatorProfiles.id, [...ids]),
            eq(creatorProfiles.isPublic, true),
            eq(creatorProfiles.isClaimed, true)
          )
        ),
    loadCandidates: () =>
      db
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
        .limit(100),
  });
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ unpublish-placeholder-identities failed:', error);
      process.exit(1);
    });
}
