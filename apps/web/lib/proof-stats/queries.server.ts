import 'server-only';
import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import {
  externalAccountSql,
  notInternalProfileSql,
} from '@/lib/accounts/internal-account';
import { db } from '@/lib/db';
import { PUBLIC_PROFILE_RESERVED_IDENTITY_HANDLES } from '@/lib/profile/public-profile-identity-policy';

/** Production counts use the canonical internal/test/synthetic account classifier. */
function reservedHandlesSql(column: SQL): SQL {
  const handles = PUBLIC_PROFILE_RESERVED_IDENTITY_HANDLES.map(
    handle => drizzleSql`${handle}`
  );
  return handles.length
    ? drizzleSql`${column} not in (${drizzleSql.join(handles, drizzleSql`, `)})`
    : drizzleSql`true`;
}
const QUERIES: Readonly<Record<string, () => SQL>> = {
  accounts_total: () => drizzleSql`
    select count(*)::bigint as value from users
    where deleted_at is null
      and ${externalAccountSql(drizzleSql.raw('users.email'), drizzleSql.raw('users.account_class'))}`,
  artists_claimed: () => drizzleSql`
    select count(*)::bigint as value from creator_profiles cp
    where cp.is_claimed = true
      and ${reservedHandlesSql(drizzleSql.raw('cp.username_normalized'))}
      and ${notInternalProfileSql(drizzleSql.raw('cp.id'))}`,
  smart_links_total: () => drizzleSql`
    select count(*)::bigint as value from (
      select distinct s.creator_profile_id, s.smart_link_slug
      from smart_link_targets s
      where ${notInternalProfileSql(drizzleSql.raw('s.creator_profile_id'))}
    ) links`,
  release_alerts_delivered: () => drizzleSql`
    select count(*)::bigint as value from fan_release_notifications n
    where n.status = 'sent'
      and ${notInternalProfileSql(drizzleSql.raw('n.creator_profile_id'))}`,
};
export function hasProductionQuery(ref: string): boolean {
  return Object.hasOwn(QUERIES, ref);
}
export function productionQueryRefs(): readonly string[] {
  return Object.keys(QUERIES);
}
export async function measureProductionStat(ref: string): Promise<number> {
  const build = QUERIES[ref];
  if (!build) throw new Error(`No production query for ${ref}`);
  const result = await db.execute(build());
  const rows =
    (result as unknown as { rows?: Record<string, unknown>[] }).rows ?? [];
  const value = Number(rows[0]?.value);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Production query ${ref} returned no count`);
  }
  return value;
}
