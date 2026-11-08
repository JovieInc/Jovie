import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureError } from '@/lib/error-tracking';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';

/**
 * Invite-link conversion stamps (canon/PRODUCT.md, 2026-11-02; measure every
 * stage). Keyed per person on the waitlist entry, stored on
 * `qualification_inputs` beside `acquisitionId` (no schema change). Each key
 * is written once (first occurrence wins).
 *
 * Funnel per entry:
 *   invite sent            waitlist_entries.invited_at (existing column)
 *   invite opened          qualification_inputs.inviteOpenedAt
 *   account created        qualification_inputs.inviteAccountCreatedAt
 *   golden path entered    qualification_inputs.goldenPathEnteredAt
 *   golden path completed  waitlist_entries.signed_up_at (existing column)
 *
 * Measurement only: never throws, so an invitee's path is never blocked.
 */
export const INVITE_FUNNEL_KEYS = {
  opened: 'inviteOpenedAt',
  accountCreated: 'inviteAccountCreatedAt',
  goldenPathEntered: 'goldenPathEnteredAt',
} as const;

function stampOnceSql(key: string, iso: string) {
  return drizzleSql`coalesce(${waitlistEntries.qualificationInputs}, '{}'::jsonb) || jsonb_build_object(${key}::text, coalesce(${waitlistEntries.qualificationInputs}->>${key}, ${iso}::text))`;
}

/** First visit to `/waitlist/invite?token=` with a token that matches an entry. */
export async function recordInviteOpened(
  token: string,
  now = new Date()
): Promise<void> {
  try {
    await db
      .update(waitlistEntries)
      .set({
        qualificationInputs: stampOnceSql(
          INVITE_FUNNEL_KEYS.opened,
          now.toISOString()
        ),
      })
      .where(
        drizzleSql`${waitlistEntries.inviteTokenHash} = ${hashWaitlistInviteToken(token)} AND ${waitlistEntries.qualificationInputs}->>${INVITE_FUNNEL_KEYS.opened} IS NULL`
      );
  } catch (error) {
    await captureError('Failed to record waitlist invite opened', error, {
      route: 'lib/waitlist/invite-funnel',
    });
  }
}

/**
 * An invite redeemed into a signed-in account: the account's real creation
 * time (`users.created_at`) and the hand-off into the `/start` golden path.
 */
export async function recordInviteRedeemed(params: {
  readonly entryId: string;
  readonly appUserId: string;
  readonly now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  try {
    const [user] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, params.appUserId))
      .limit(1);
    const accountCreatedAt = (user?.createdAt ?? now).toISOString();
    await db
      .update(waitlistEntries)
      .set({
        qualificationInputs: drizzleSql`${stampOnceSql(
          INVITE_FUNNEL_KEYS.accountCreated,
          accountCreatedAt
        )} || jsonb_build_object(${INVITE_FUNNEL_KEYS.goldenPathEntered}::text, coalesce(${waitlistEntries.qualificationInputs}->>${INVITE_FUNNEL_KEYS.goldenPathEntered}, ${now.toISOString()}::text))`,
      })
      .where(eq(waitlistEntries.id, params.entryId));
  } catch (error) {
    await captureError('Failed to record waitlist invite redeemed', error, {
      route: 'lib/waitlist/invite-funnel',
    });
  }
}
