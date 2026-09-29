import 'server-only';

import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import {
  profileActionApprovals,
  profileApprovalEvents,
} from '@/lib/db/schema/profile-approvals';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import {
  decideProfileAction,
  PROFILE_ACTION_POLICY,
  type RiskyProfileAction,
  resolveTeamRole,
  type TeamRole,
} from './permissions';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const APPROVAL_TTL_MS = 72 * 60 * 60 * 1000;

export type TeamRoleResult = { role: TeamRole | null };

export async function getProfileTeamRole(
  tx: DbOrTransaction,
  profileId: string,
  appUserId: string
): Promise<TeamRoleResult> {
  if (!UUID_RE.test(profileId) || !UUID_RE.test(appUserId)) {
    return { role: null };
  }

  const claimRows = await tx
    .select({ userId: userProfileClaims.userId, role: userProfileClaims.role })
    .from(userProfileClaims)
    .where(eq(userProfileClaims.creatorProfileId, profileId));

  const [profile] = await tx
    .select({ userId: creatorProfiles.userId })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  if (!profile) return { role: null };

  return {
    role: resolveTeamRole({
      appUserId,
      legacyOwnerUserId: profile.userId,
      claimRows,
    }),
  };
}

export type RiskyActionAuthorization =
  | { status: 'allowed'; role: TeamRole; approvalId?: string }
  | { status: 'requires_approval'; role: TeamRole }
  | { status: 'denied'; role: TeamRole | null };

/**
 * Authorize a risky profile action. When the caller's role is approval-gated,
 * a single-use, unexpired owner approval is consumed to let the action
 * proceed. Everything is decided server-side from claims — there is no
 * client-supplied role to bypass.
 */
export async function authorizeRiskyProfileAction(
  tx: DbOrTransaction,
  input: { appUserId: string; profileId: string; action: RiskyProfileAction }
): Promise<RiskyActionAuthorization> {
  const { role } = await getProfileTeamRole(
    tx,
    input.profileId,
    input.appUserId
  );
  const decision = decideProfileAction(role, input.action);
  if (decision === 'deny') return { status: 'denied', role };
  if (decision === 'allow')
    return { status: 'allowed', role: role as TeamRole };

  await expireStaleApprovals(tx, input.profileId);

  const now = new Date();
  const [approval] = await tx
    .select({ id: profileActionApprovals.id })
    .from(profileActionApprovals)
    .where(
      and(
        eq(profileActionApprovals.creatorProfileId, input.profileId),
        eq(profileActionApprovals.action, input.action),
        eq(profileActionApprovals.requestedBy, input.appUserId),
        eq(profileActionApprovals.status, 'approved'),
        gt(profileActionApprovals.expiresAt, now),
        isNull(profileActionApprovals.consumedAt)
      )
    )
    .limit(1);

  if (!approval) {
    return { status: 'requires_approval', role: role as TeamRole };
  }

  await tx
    .update(profileActionApprovals)
    .set({ consumedAt: now, updatedAt: now })
    .where(eq(profileActionApprovals.id, approval.id));
  await tx.insert(profileApprovalEvents).values({
    approvalId: approval.id,
    creatorProfileId: input.profileId,
    event: 'consumed',
    actorId: input.appUserId,
  });

  return { status: 'allowed', role: role as TeamRole, approvalId: approval.id };
}

async function expireStaleApprovals(
  tx: DbOrTransaction,
  profileId: string
): Promise<void> {
  const now = new Date();
  const stale = await tx
    .select({ id: profileActionApprovals.id })
    .from(profileActionApprovals)
    .where(
      and(
        eq(profileActionApprovals.creatorProfileId, profileId),
        inArray(profileActionApprovals.status, ['pending', 'approved']),
        isNull(profileActionApprovals.consumedAt),
        lte(profileActionApprovals.expiresAt, now)
      )
    );
  if (stale.length === 0) return;

  const ids = stale.map(row => row.id);
  await tx
    .update(profileActionApprovals)
    .set({ status: 'expired', updatedAt: now })
    .where(inArray(profileActionApprovals.id, ids));
  await tx.insert(profileApprovalEvents).values(
    ids.map(id => ({
      approvalId: id,
      creatorProfileId: profileId,
      event: 'expired' as const,
    }))
  );
  alertApprovalEvent('expired', {
    profileId,
    approvalCount: ids.length,
  });
}

function alertApprovalEvent(
  event: string,
  context: Record<string, string | number | undefined>
): void {
  void captureWarning(`Profile approval ${event}`, undefined, context).catch(
    () => {}
  );
}

export type ApprovalRequestResult =
  | { ok: true; approvalId: string; alreadyPending: boolean }
  | { ok: false; reason: 'invalid' | 'forbidden' | 'not_needed' };

/**
 * Create (or return the existing pending) owner-approval request for a risky
 * action. Only roles in the action's `approvable` set may request; owners do
 * not need approval and viewers/denied roles cannot request at all.
 */
export async function requestProfileApproval(
  tx: DbOrTransaction,
  input: {
    appUserId: string;
    profileId: string;
    action: RiskyProfileAction;
    payload?: Record<string, unknown>;
    reason?: string;
  }
): Promise<ApprovalRequestResult> {
  if (!UUID_RE.test(input.appUserId) || !UUID_RE.test(input.profileId)) {
    return { ok: false, reason: 'invalid' };
  }
  const { role } = await getProfileTeamRole(
    tx,
    input.profileId,
    input.appUserId
  );
  if (!role) return { ok: false, reason: 'forbidden' };
  if (!PROFILE_ACTION_POLICY[input.action].approvable.includes(role)) {
    return {
      ok: false,
      reason:
        decideProfileAction(role, input.action) === 'allow'
          ? 'not_needed'
          : 'forbidden',
    };
  }

  const [existing] = await tx
    .select({ id: profileActionApprovals.id })
    .from(profileActionApprovals)
    .where(
      and(
        eq(profileActionApprovals.creatorProfileId, input.profileId),
        eq(profileActionApprovals.action, input.action),
        eq(profileActionApprovals.requestedBy, input.appUserId),
        eq(profileActionApprovals.status, 'pending')
      )
    )
    .limit(1);
  if (existing)
    return { ok: true, approvalId: existing.id, alreadyPending: true };

  const now = new Date();
  const [approval] = await tx
    .insert(profileActionApprovals)
    .values({
      creatorProfileId: input.profileId,
      action: input.action,
      requestedBy: input.appUserId,
      payload: input.payload ?? null,
      reason: input.reason ?? null,
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    })
    .returning({ id: profileActionApprovals.id });
  await tx.insert(profileApprovalEvents).values({
    approvalId: approval.id,
    creatorProfileId: input.profileId,
    event: 'requested',
    actorId: input.appUserId,
  });
  alertApprovalEvent('requested', {
    profileId: input.profileId,
    action: input.action,
    requestedBy: input.appUserId,
  });
  return { ok: true, approvalId: approval.id, alreadyPending: false };
}

export type ApprovalDecisionResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid' | 'not_found' | 'forbidden' | 'not_pending';
    };

/**
 * Owner decision on a pending approval. Only the profile owner may decide;
 * the check is server-enforced from claims so no API variant can bypass it.
 */
export async function decideProfileApproval(
  tx: DbOrTransaction,
  input: {
    approvalId: string;
    actorUserId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  }
): Promise<ApprovalDecisionResult> {
  if (!UUID_RE.test(input.approvalId) || !UUID_RE.test(input.actorUserId)) {
    return { ok: false, reason: 'invalid' };
  }
  const [approval] = await tx
    .select()
    .from(profileActionApprovals)
    .where(eq(profileActionApprovals.id, input.approvalId))
    .limit(1);
  if (!approval) return { ok: false, reason: 'not_found' };

  const { role } = await getProfileTeamRole(
    tx,
    approval.creatorProfileId,
    input.actorUserId
  );
  if (role !== 'owner') return { ok: false, reason: 'forbidden' };

  await expireStaleApprovals(tx, approval.creatorProfileId);
  if (approval.status !== 'pending' || approval.expiresAt <= new Date()) {
    return { ok: false, reason: 'not_pending' };
  }

  const now = new Date();
  await tx
    .update(profileActionApprovals)
    .set({
      status: input.decision,
      decidedBy: input.actorUserId,
      decidedAt: now,
      reason: input.reason ?? approval.reason,
      updatedAt: now,
    })
    .where(eq(profileActionApprovals.id, approval.id));
  await tx.insert(profileApprovalEvents).values({
    approvalId: approval.id,
    creatorProfileId: approval.creatorProfileId,
    event: input.decision,
    actorId: input.actorUserId,
  });
  alertApprovalEvent(input.decision, {
    profileId: approval.creatorProfileId,
    action: approval.action,
    approvalId: approval.id,
  });
  return { ok: true };
}

/**
 * Revoke an approval. The requester can withdraw their own request; the owner
 * can revoke any pending or approved grant (e.g. after a suspected hijack).
 */
export async function revokeProfileApproval(
  tx: DbOrTransaction,
  input: { approvalId: string; actorUserId: string }
): Promise<ApprovalDecisionResult> {
  if (!UUID_RE.test(input.approvalId) || !UUID_RE.test(input.actorUserId)) {
    return { ok: false, reason: 'invalid' };
  }
  const [approval] = await tx
    .select()
    .from(profileActionApprovals)
    .where(eq(profileActionApprovals.id, input.approvalId))
    .limit(1);
  if (!approval) return { ok: false, reason: 'not_found' };

  const { role } = await getProfileTeamRole(
    tx,
    approval.creatorProfileId,
    input.actorUserId
  );
  const isRequester = approval.requestedBy === input.actorUserId;
  if (role !== 'owner' && !isRequester) {
    return { ok: false, reason: 'forbidden' };
  }
  if (approval.status !== 'pending' && approval.status !== 'approved') {
    return { ok: false, reason: 'not_pending' };
  }

  const now = new Date();
  await tx
    .update(profileActionApprovals)
    .set({ status: 'revoked', updatedAt: now })
    .where(eq(profileActionApprovals.id, approval.id));
  await tx.insert(profileApprovalEvents).values({
    approvalId: approval.id,
    creatorProfileId: approval.creatorProfileId,
    event: 'revoked',
    actorId: input.actorUserId,
  });
  alertApprovalEvent('revoked', {
    profileId: approval.creatorProfileId,
    action: approval.action,
    approvalId: approval.id,
  });
  return { ok: true };
}

/**
 * List approvals for a profile. Any team member can read the queue so pending
 * requests stay visible to the people who must act on them.
 */
export async function listProfileApprovals(
  tx: DbOrTransaction,
  input: { profileId: string; appUserId: string }
): Promise<
  | { ok: true; approvals: (typeof profileActionApprovals.$inferSelect)[] }
  | { ok: false; reason: 'invalid' | 'forbidden' | 'not_found' }
> {
  if (!UUID_RE.test(input.profileId) || !UUID_RE.test(input.appUserId)) {
    return { ok: false, reason: 'invalid' };
  }
  await expireStaleApprovals(tx, input.profileId);
  const { role } = await getProfileTeamRole(
    tx,
    input.profileId,
    input.appUserId
  );
  if (!role) return { ok: false, reason: 'forbidden' };

  const approvals = await tx
    .select()
    .from(profileActionApprovals)
    .where(eq(profileActionApprovals.creatorProfileId, input.profileId));
  return { ok: true, approvals };
}
