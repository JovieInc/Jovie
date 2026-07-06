import 'server-only';

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';
import { normalizeEmail } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import { isWaitlistApprovedStatus } from '@/lib/waitlist/state-machine';
import { getWaitlistAccess } from './gate';
import { determineUserStatus } from './user-status';

/**
 * App-user provisioning for Better Auth sign-ins.
 *
 * Called from the Better Auth `databaseHooks.user.create.after` hook
 * (lib/auth/better-auth.ts). Replaces the Clerk webhook provisioning path;
 * gate.ts lazy-create remains the healing fallback.
 *
 * Idempotent by construction so it converges under the hook-vs-lazy-create
 * race (plan amendment rows 7/35):
 * 1. Already linked → return the existing row.
 * 2. Verified email → adopt the Clerk-era row
 *    (`WHERE email = $email AND better_auth_user_id IS NULL`).
 * 3. Insert a new row with the waitlist-derived status gate.ts would give a
 *    brand-new user, `ON CONFLICT DO NOTHING`, then re-select.
 *
 * NEVER throws — a throw here would fail the OAuth callback after the
 * ba_users row exists and never re-fire. Failures are captured and healed by
 * the gate.ts lazy-create fallback on the next request.
 */

export interface ProvisionAppUserInput {
  readonly betterAuthUserId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string | null;
}

async function findByBetterAuthId(
  betterAuthUserId: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.betterAuthUserId, betterAuthUserId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Clerk-era adoption: link the pre-existing app user that owns this verified
 * email. Case-insensitive on the stored email (Clerk-era rows preserved the
 * caller's casing; Better Auth lowercases).
 */
async function adoptByVerifiedEmail(
  betterAuthUserId: string,
  normalizedEmail: string
): Promise<string | null> {
  const [adopted] = await db
    .update(users)
    .set({ betterAuthUserId, updatedAt: new Date() })
    .where(
      and(
        drizzleSql`lower(${users.email}) = ${normalizedEmail}`,
        isNull(users.betterAuthUserId)
      )
    )
    .returning({ id: users.id });
  return adopted?.id ?? null;
}

export async function provisionAppUser(
  input: ProvisionAppUserInput
): Promise<string | null> {
  const { betterAuthUserId, email, emailVerified, name } = input;
  try {
    // 1. Idempotency: already provisioned/linked.
    const existingId = await findByBetterAuthId(betterAuthUserId);
    if (existingId) return existingId;

    const normalizedEmail = normalizeEmail(email);

    // 2. Adopt an existing Clerk-era row by verified email.
    if (emailVerified && normalizedEmail) {
      const adoptedId = await adoptByVerifiedEmail(
        betterAuthUserId,
        normalizedEmail
      );
      if (adoptedId) return adoptedId;
    }

    // 3. Insert a new app user with the same waitlist-derived status gate.ts
    //    assigns to brand-new users (shared determineUserStatus).
    const [waitlistGateEnabled, waitlistAccess] = await Promise.all([
      isWaitlistGateEnabled(),
      getWaitlistAccess(email),
    ]);
    const approvedEntryId = isWaitlistApprovedStatus(waitlistAccess.status)
      ? (waitlistAccess.entryId ?? undefined)
      : undefined;
    const userStatus = determineUserStatus(
      approvedEntryId,
      undefined,
      waitlistGateEnabled
    );

    const [inserted] = await db
      .insert(users)
      .values({
        betterAuthUserId,
        // TEMPORARY sentinel: users.clerk_id is still NOT NULL until the
        // identity-flip commit of this migration drops the constraint
        // (docs/auth/better-auth-migration-plan.md build order ⑤). The flip
        // commit removes this line. 'ba:'-prefixed ids never collide with
        // real Clerk 'user_...' ids.
        clerkId: `ba:${betterAuthUserId}`,
        email: normalizedEmail || email,
        name: name ?? null,
        userStatus,
        waitlistEntryId: approvedEntryId,
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (inserted) return inserted.id;

    // 4. Lost a race (unique conflict on email or better_auth_user_id):
    //    converge on whichever writer won.
    const racedId = await findByBetterAuthId(betterAuthUserId);
    if (racedId) return racedId;
    if (emailVerified && normalizedEmail) {
      const lateAdoptedId = await adoptByVerifiedEmail(
        betterAuthUserId,
        normalizedEmail
      );
      if (lateAdoptedId) return lateAdoptedId;
    }

    const error = new Error(
      'provisionAppUser could not create, adopt, or converge on an app user'
    );
    await captureError('Better Auth provisioning did not converge', error, {
      betterAuthUserId,
      operation: 'provisionAppUser',
    });
    return null;
  } catch (error) {
    logger.error('[auth/provision] provisionAppUser failed', error);
    await captureError('Better Auth user provisioning failed', error, {
      betterAuthUserId,
      operation: 'provisionAppUser',
    });
    return null;
  }
}
