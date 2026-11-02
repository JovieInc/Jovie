import { sql as drizzleSql } from 'drizzle-orm';
import { db, doesTableExist } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { INVITE_FUNNEL_KEYS } from '@/lib/waitlist/invite-funnel';
import { WAITLIST_ROLES, type WaitlistRole } from '@/lib/waitlist/roles';
import { organicWaitlistEntrySql } from './organic-waitlist';

/**
 * Closed-signup funnel for Admin People -> Waitlist (canon/PRODUCT.md,
 * 2026-11-02). Every stage is a per-entry machine timestamp, so counts and
 * stage latencies come from the same rows:
 *   submitted by role -> invite sent -> opened -> account created ->
 *   golden path entered -> golden path completed (signed_up_at).
 */
export interface WaitlistGateFunnel {
  readonly byRole: ReadonlyArray<{
    readonly role: WaitlistRole;
    readonly count: number;
  }>;
  readonly invite: {
    readonly sent: number;
    readonly opened: number;
    readonly accountCreated: number;
    readonly goldenPathEntered: number;
    readonly goldenPathCompleted: number;
  };
  /** p50 hours from invite sent to golden path entered; null with no data. */
  readonly p50HoursSentToGoldenPath: number | null;
}

const EMPTY_FUNNEL: WaitlistGateFunnel = {
  byRole: WAITLIST_ROLES.map(({ value }) => ({ role: value, count: 0 })),
  invite: {
    sent: 0,
    opened: 0,
    accountCreated: 0,
    goldenPathEntered: 0,
    goldenPathCompleted: 0,
  },
  p50HoursSentToGoldenPath: null,
};

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getWaitlistGateFunnel(): Promise<WaitlistGateFunnel> {
  if (!(await doesTableExist('waitlist_entries'))) return EMPTY_FUNNEL;

  const qi = waitlistEntries.qualificationInputs;
  const scope = drizzleSql`${waitlistEntries.canonical} = true AND ${organicWaitlistEntrySql()}`;

  const [roleRows, funnelRows] = await Promise.all([
    db
      .select({
        role: drizzleSql<string>`${qi}->>'role'`,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(waitlistEntries)
      .where(drizzleSql`${scope} AND ${qi}->>'role' IS NOT NULL`)
      .groupBy(drizzleSql`${qi}->>'role'`),
    db
      .select({
        sent: drizzleSql<number>`count(*) FILTER (WHERE ${waitlistEntries.invitedAt} IS NOT NULL)::int`,
        opened: drizzleSql<number>`count(*) FILTER (WHERE ${qi}->>${INVITE_FUNNEL_KEYS.opened} IS NOT NULL)::int`,
        accountCreated: drizzleSql<number>`count(*) FILTER (WHERE ${qi}->>${INVITE_FUNNEL_KEYS.accountCreated} IS NOT NULL)::int`,
        goldenPathEntered: drizzleSql<number>`count(*) FILTER (WHERE ${qi}->>${INVITE_FUNNEL_KEYS.goldenPathEntered} IS NOT NULL)::int`,
        goldenPathCompleted: drizzleSql<number>`count(*) FILTER (WHERE ${waitlistEntries.signedUpAt} IS NOT NULL AND ${qi}->>${INVITE_FUNNEL_KEYS.goldenPathEntered} IS NOT NULL)::int`,
        p50Hours: drizzleSql<
          number | null
        >`percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ((${qi}->>${INVITE_FUNNEL_KEYS.goldenPathEntered})::timestamptz - ${waitlistEntries.invitedAt})) / 3600) FILTER (WHERE ${waitlistEntries.invitedAt} IS NOT NULL AND ${qi}->>${INVITE_FUNNEL_KEYS.goldenPathEntered} IS NOT NULL)`,
      })
      .from(waitlistEntries)
      .where(scope),
  ]);

  const counts = new Map(roleRows.map(row => [row.role, toNumber(row.count)]));
  const funnel = funnelRows[0];
  const p50 = funnel?.p50Hours;

  return {
    byRole: WAITLIST_ROLES.map(({ value }) => ({
      role: value,
      count: counts.get(value) ?? 0,
    })),
    invite: {
      sent: toNumber(funnel?.sent),
      opened: toNumber(funnel?.opened),
      accountCreated: toNumber(funnel?.accountCreated),
      goldenPathEntered: toNumber(funnel?.goldenPathEntered),
      goldenPathCompleted: toNumber(funnel?.goldenPathCompleted),
    },
    p50HoursSentToGoldenPath:
      p50 === null || p50 === undefined ? null : toNumber(p50),
  };
}
