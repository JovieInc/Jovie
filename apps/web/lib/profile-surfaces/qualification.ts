import 'server-only';

import { and, desc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import {
  profileSurfaceQualificationEvents,
  profileSurfaceSources,
  profileSurfaces,
} from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import type { ProfileQualificationStatus } from './contracts';

export const PROFILE_IDENTITY_DECISIONS = ['yes', 'no', 'unsure'] as const;
export type ProfileIdentityDecision =
  (typeof PROFILE_IDENTITY_DECISIONS)[number];

const REVIEWABLE_STATUSES = new Set<ProfileQualificationStatus>([
  'suggested',
  'conflicting',
]);

const DECISION_STATE: Readonly<
  Record<
    ProfileIdentityDecision,
    {
      readonly status: ProfileQualificationStatus;
      readonly confidence: string | null;
      readonly isOfficial: boolean;
      readonly reason: string;
    }
  >
> = {
  yes: {
    status: 'qualified',
    confidence: '1.00',
    isOfficial: true,
    reason: 'owner_confirmed_identity',
  },
  no: {
    status: 'rejected',
    confidence: '0.00',
    isOfficial: false,
    reason: 'owner_rejected_identity',
  },
  unsure: {
    status: 'conflicting',
    confidence: null,
    isOfficial: false,
    reason: 'owner_marked_identity_unsure',
  },
};

export function qualificationForIdentityDecision(
  decision: ProfileIdentityDecision
) {
  return DECISION_STATE[decision];
}

export type ProfileSurfaceQualificationResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly status: ProfileQualificationStatus;
    }
  | {
      readonly ok: false;
      readonly reason: 'not_found' | 'not_reviewable' | 'stale';
    };

/**
 * Bind one owner decision to the canonical surface and its live source claims.
 * Call inside withDbSessionTx so the state and immutable evidence event commit
 * together under the authenticated user's RLS identity.
 */
export async function qualifyProfileSurface(
  tx: DbOrTransaction,
  input: {
    readonly surfaceId: string;
    readonly actorUserId: string;
    readonly decision: ProfileIdentityDecision;
    readonly now?: Date;
  }
): Promise<ProfileSurfaceQualificationResult> {
  const [surface] = await tx
    .select({
      id: profileSurfaces.id,
      creatorProfileId: profileSurfaces.creatorProfileId,
      platform: profileSurfaces.platform,
      normalizedUrl: profileSurfaces.normalizedUrl,
      externalId: profileSurfaces.externalId,
      qualificationStatus: profileSurfaces.qualificationStatus,
      identityConfidence: profileSurfaces.identityConfidence,
      lastDiscoveredAt: profileSurfaces.lastDiscoveredAt,
    })
    .from(profileSurfaces)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, profileSurfaces.creatorProfileId)
    )
    .leftJoin(
      userProfileClaims,
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
        eq(userProfileClaims.userId, input.actorUserId),
        eq(userProfileClaims.role, 'owner')
      )
    )
    .where(
      and(
        eq(profileSurfaces.id, input.surfaceId),
        or(
          eq(creatorProfiles.userId, input.actorUserId),
          isNotNull(userProfileClaims.id)
        ),
        isNull(profileSurfaces.retiredAt)
      )
    )
    .limit(1);

  if (!surface) return { ok: false, reason: 'not_found' };

  const decisionState = qualificationForIdentityDecision(input.decision);
  const currentStatus =
    surface.qualificationStatus as ProfileQualificationStatus;
  const [priorOwnerDecision] = await tx
    .select({ id: profileSurfaceQualificationEvents.id })
    .from(profileSurfaceQualificationEvents)
    .where(
      and(
        eq(profileSurfaceQualificationEvents.surfaceId, surface.id),
        eq(profileSurfaceQualificationEvents.actorType, 'profile_owner'),
        eq(profileSurfaceQualificationEvents.actorId, input.actorUserId),
        eq(profileSurfaceQualificationEvents.nextStatus, decisionState.status)
      )
    )
    .orderBy(desc(profileSurfaceQualificationEvents.createdAt))
    .limit(1);

  if (currentStatus === decisionState.status && priorOwnerDecision) {
    return { ok: true, changed: false, status: decisionState.status };
  }
  if (
    currentStatus !== decisionState.status &&
    !REVIEWABLE_STATUSES.has(currentStatus)
  ) {
    return { ok: false, reason: 'not_reviewable' };
  }

  const sourceClaims = await tx
    .select({
      sourceType: profileSurfaceSources.sourceType,
      sourceRefId: profileSurfaceSources.sourceRefId,
      sourceUrl: profileSurfaceSources.sourceUrl,
      externalId: profileSurfaceSources.externalId,
      firstSeenAt: profileSurfaceSources.firstSeenAt,
      lastSeenAt: profileSurfaceSources.lastSeenAt,
    })
    .from(profileSurfaceSources)
    .where(
      and(
        eq(profileSurfaceSources.surfaceId, surface.id),
        eq(profileSurfaceSources.isLive, true)
      )
    );

  const now = input.now ?? new Date();
  const [updated] = await tx
    .update(profileSurfaces)
    .set({
      qualificationStatus: decisionState.status,
      ...(decisionState.confidence === null
        ? {}
        : { identityConfidence: decisionState.confidence }),
      isOfficial: decisionState.isOfficial,
      lastVerifiedAt: input.decision === 'unsure' ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(profileSurfaces.id, surface.id),
        eq(profileSurfaces.qualificationStatus, currentStatus)
      )
    )
    .returning({ id: profileSurfaces.id });

  if (!updated) return { ok: false, reason: 'stale' };

  await tx.insert(profileSurfaceQualificationEvents).values({
    surfaceId: surface.id,
    previousStatus: currentStatus,
    nextStatus: decisionState.status,
    actorType: 'profile_owner',
    actorId: input.actorUserId,
    reason: decisionState.reason,
    evidence: {
      schema: 'presence-identity-confirmation/v1',
      decision: input.decision,
      observedAt: now.toISOString(),
      surface: {
        platform: surface.platform,
        normalizedUrl: surface.normalizedUrl,
        externalId: surface.externalId,
        candidateConfidence:
          surface.identityConfidence === null
            ? null
            : Number(surface.identityConfidence),
        lastDiscoveredAt: surface.lastDiscoveredAt?.toISOString() ?? null,
      },
      sourceClaims: sourceClaims.map(source => ({
        sourceType: source.sourceType,
        sourceRefId: source.sourceRefId,
        sourceUrl: source.sourceUrl,
        externalId: source.externalId,
        firstSeenAt: source.firstSeenAt.toISOString(),
        lastSeenAt: source.lastSeenAt.toISOString(),
      })),
    },
  });

  return {
    ok: true,
    changed: currentStatus !== decisionState.status || !priorOwnerDecision,
    status: decisionState.status,
  };
}
