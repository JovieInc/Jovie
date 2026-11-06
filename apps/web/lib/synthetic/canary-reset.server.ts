import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { chatConversations } from '@/lib/db/schema/chat';
import { suggestedActions } from '@/lib/db/schema/connectors';
import {
  creatorProfiles,
  profileOwnershipLog,
  userProfileClaims,
} from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';
import {
  type CanaryResetPlan,
  type CanaryResetProfileRow,
  isClaimWalkCanaryEmail,
  planCanaryReset,
  summarizeCanaryResetPlan,
} from './canary-reset-plan';
import { PRODCERT_CLAIM_CANARY_EMAIL } from './prodcert-identities';

/**
 * Executor for the canary account reset (JOV-9826). See
 * `canary-reset-plan.ts` for the reset semantics.
 *
 * Fail-closed properties:
 *   - the account is resolved by the EXACT canary address; a missing or
 *     differently-cased/aliased account is a refusal, never a partial reset;
 *   - every write is scoped to the canary user id inside one transaction;
 *   - the reset is audited to `profile_ownership_log` (action `unlinked`,
 *     reason tagged internal) and to the structured logger.
 */

export type CanaryResetOutcome =
  | {
      readonly ok: true;
      readonly plan: CanaryResetPlan;
      readonly summary: string;
    }
  | { readonly ok: false; readonly reason: 'unknown_canary_account' };

/**
 * Resolve the canary account by exact email and refuse anything else.
 * Exported for the endpoint so the refusal is testable and the route stays
 * thin; the plan's own email gate runs again inside the transaction.
 */
export async function resolveCanaryAccount(): Promise<{
  id: string;
  email: string;
} | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, PRODCERT_CLAIM_CANARY_EMAIL))
    .limit(1);
  if (!row?.email || !isClaimWalkCanaryEmail(row.email)) return null;
  return { id: row.id, email: row.email };
}

export async function executeCanaryReset(): Promise<CanaryResetOutcome> {
  const account = await resolveCanaryAccount();
  if (!account) return { ok: false, reason: 'unknown_canary_account' };

  const plan = await runAtomicDbOperation(
    async tx => {
      const claimRows = await tx
        .select({ id: userProfileClaims.id, userId: userProfileClaims.userId })
        .from(userProfileClaims)
        .where(eq(userProfileClaims.userId, account.id));

      const profileRows: CanaryResetProfileRow[] = await tx
        .select({
          id: creatorProfiles.id,
          userId: creatorProfiles.userId,
          usernameNormalized: creatorProfiles.usernameNormalized,
          isClaimed: creatorProfiles.isClaimed,
          isPublic: creatorProfiles.isPublic,
          claimedAt: creatorProfiles.claimedAt,
          claimToken: creatorProfiles.claimToken,
          claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
          onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
          settings: creatorProfiles.settings,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, account.id));

      const plan = planCanaryReset({
        user: account,
        claimRows,
        profileRows,
      });

      if (plan.claimRowIds.length > 0) {
        await tx
          .delete(userProfileClaims)
          .where(inArray(userProfileClaims.id, [...plan.claimRowIds]));
      }

      for (const update of plan.profileUpdates) {
        const [claimed] = await tx
          .update(creatorProfiles)
          .set({ ...update.set, updatedAt: new Date() })
          .where(
            and(
              eq(creatorProfiles.id, update.id),
              eq(creatorProfiles.userId, account.id)
            )
          )
          .returning({ id: creatorProfiles.id });
        if (!claimed) {
          throw new Error(
            `CANARY_RESET_CONFLICT: profile ${update.id} left canary ownership mid-reset`
          );
        }
        await tx.insert(profileOwnershipLog).values({
          creatorProfileId: update.id,
          userId: account.id,
          action: 'unlinked',
          performedBy: account.id,
          reason: 'internal: canary reset to pre-claim state (JOV-9826)',
        });
      }

      if (plan.deleteChatConversations) {
        await tx
          .delete(chatConversations)
          .where(eq(chatConversations.userId, account.id));
      }
      if (plan.deleteSuggestedActions) {
        await tx
          .delete(suggestedActions)
          .where(eq(suggestedActions.userId, account.id));
      }

      return plan;
    },
    { actorId: 'system_canary_reset', system: true, retry: 'serialization' }
  );

  const summary = summarizeCanaryResetPlan(plan);
  logger.info('[canary-reset] completed', {
    internal: true,
    canaryUserId: plan.canaryUserId,
    summary,
  });
  if (!logger.enabled) {
    console.info('[canary-reset] completed', {
      internal: true,
      canaryUserId: plan.canaryUserId,
      summary,
    });
  }
  return { ok: true, plan, summary };
}
