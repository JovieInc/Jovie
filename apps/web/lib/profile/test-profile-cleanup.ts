/**
 * Test-profile cleanup. Unpublishes (is_public=false) and releases the Spotify
 * pool binding of profiles owned by test accounts, as classified by
 * `isTestProfileOwnerEmail` (single source of truth). Never deletes rows, never
 * touches users, skips exact-exempt canary fixtures, and is idempotent (cleaned
 * rows stop matching). Dry run unless `apply: true`.
 *
 * The SQL pattern is only a prefilter; every candidate is re-verified with the
 * JS classifier before any write.
 */
import { sql as drizzleSql } from 'drizzle-orm';
import {
  isTestProfile,
  isTestProfileCleanupProtected,
} from '@/lib/profile/test-profile-policy';
import { buildUnpublishTestProfilesQuery } from '@/lib/services/profile/test-profile-unpublish';
import { TEST_PROFILE_OWNER_EMAIL_SQL_PATTERN } from '@/lib/utils/email';

type SqlQuery = ReturnType<typeof drizzleSql>;

export interface TestProfileCleanupDb {
  /** Runs inside one system-actor (forced-RLS aware) transaction. */
  atomic<T>(
    fn: (tx: {
      execute(query: SqlQuery): Promise<{ rows: Record<string, unknown>[] }>;
    }) => Promise<T>
  ): Promise<T>;
}

export interface TestProfileCleanupReport {
  readonly mode: 'dry-run' | 'apply';
  readonly candidates: number;
  readonly matched: number;
  readonly stillPublic: number;
  readonly poolBound: number;
  readonly skippedProtected: number;
  readonly skippedNotTest: number;
  readonly unpublished: number;
  readonly unbound: number;
  readonly sample: readonly { email: string; handle: string }[];
}

/** Keeps the test marker (`+tag...` or e2e/browse), hides the rest of the local part. */
export function redactTestEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const plus = local.indexOf('+');
  const marker =
    plus >= 0 ? local.slice(plus) : /^(e2e|browse)/.exec(local)?.[0];
  return `***${marker ?? ''}@${domain}`;
}

export async function runTestProfileCleanup(
  db: TestProfileCleanupDb,
  options: { apply: boolean; sampleSize?: number }
): Promise<TestProfileCleanupReport> {
  return db.atomic(async tx => {
    const result = await tx.execute(drizzleSql`
      SELECT cp.id::text AS id,
             cp.username_normalized AS handle,
             cp.is_public AS is_public,
             (cp.spotify_id IS NOT NULL) AS pool_bound,
             u.email AS email
      FROM creator_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE (cp.is_public = true OR cp.spotify_id IS NOT NULL)
        AND lower(u.email) ~* ${TEST_PROFILE_OWNER_EMAIL_SQL_PATTERN}
    `);

    let skippedProtected = 0;
    let skippedNotTest = 0;
    const matched: {
      id: string;
      handle: string;
      email: string;
      isPublic: boolean;
      poolBound: boolean;
    }[] = [];
    for (const row of result.rows) {
      const email = String(row.email ?? '');
      const handle = String(row.handle ?? '');
      if (!isTestProfile({ ownerEmail: email })) {
        skippedNotTest++;
        continue;
      }
      if (isTestProfileCleanupProtected({ handle, ownerEmail: email })) {
        skippedProtected++;
        continue;
      }
      matched.push({
        id: String(row.id),
        handle,
        email,
        isPublic: row.is_public === true,
        poolBound: row.pool_bound === true,
      });
    }

    let unpublished = 0;
    let unbound = 0;
    if (options.apply && matched.length > 0) {
      const ids = matched.map(m => m.id);
      const updated = await tx.execute(buildUnpublishTestProfilesQuery(ids));
      unpublished = matched.filter(m => m.isPublic).length;
      unbound = matched.filter(m => m.poolBound).length;
      if (updated.rows.length !== matched.length) {
        throw new Error(
          `test-profile cleanup expected ${matched.length} updates, got ${updated.rows.length}`
        );
      }
    }

    return {
      mode: options.apply ? 'apply' : 'dry-run',
      candidates: result.rows.length,
      matched: matched.length,
      stillPublic: matched.filter(m => m.isPublic).length,
      poolBound: matched.filter(m => m.poolBound).length,
      skippedProtected,
      skippedNotTest,
      unpublished,
      unbound,
      sample: matched.slice(0, options.sampleSize ?? 10).map(m => ({
        email: redactTestEmail(m.email),
        handle: m.handle,
      })),
    };
  });
}
