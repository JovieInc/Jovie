import { sql as drizzleSql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { discogReleases } from '@/lib/db/schema/content';

/**
 * Canonical "fan-visible release" predicate used by onboarding readiness and
 * auth gating. A creator is launch-ready only when at least one release can
 * actually surface on the public profile.
 */
export function buildVisibleReleaseWhereClause(
  creatorProfileId: SQLWrapper | string
): SQL {
  return drizzleSql`
    ${discogReleases.creatorProfileId} = ${creatorProfileId}
    AND ${discogReleases.deletedAt} IS NULL
    AND ${discogReleases.status} <> 'draft'
    AND (
      ${discogReleases.revealDate} IS NULL
      OR ${discogReleases.revealDate} <= NOW()
    )
  `;
}

export function buildVisibleReleaseExistsSql(
  creatorProfileId: SQLWrapper | string
): SQL<boolean> {
  return drizzleSql<boolean>`
    EXISTS (
      SELECT 1
      FROM ${discogReleases}
      WHERE ${buildVisibleReleaseWhereClause(creatorProfileId)}
    )
  `;
}
