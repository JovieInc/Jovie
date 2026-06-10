import 'server-only';

import {
  and,
  count,
  countDistinct,
  sql as drizzleSql,
  eq,
  gte,
  inArray,
} from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  creatorAvatarCandidates,
  creatorProfiles,
  profilePhotos,
} from '@/lib/db/schema/profiles';

/** Rolling window for manual press-photo usage signals. */
export const ACTIVATION_EVIDENCE_LOOKBACK_DAYS = 30;

export interface BulkPressPhotoActivationEvidence {
  readonly lookbackDays: number;
  readonly manualUploadCount: number;
  readonly manualUploadProfiles: number;
  readonly profilesWithMultipleManualPressPhotos: number;
  readonly ingestedDraftCount: number;
  readonly avatarCandidateProfiles: number;
}

export interface ActivationEvidenceThresholds {
  readonly minManualUploadCount: number;
  readonly minManualUploadProfiles: number;
  readonly minProfilesWithMultipleManualPressPhotos: number;
}

export const DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS: ActivationEvidenceThresholds =
  {
    minManualUploadCount: 20,
    minManualUploadProfiles: 8,
    minProfilesWithMultipleManualPressPhotos: 5,
  };

export type ActivationEvidenceDecisionReason =
  | 'override_passed'
  | 'manual_upload_volume'
  | 'multi_photo_migration_signal'
  | 'insufficient_manual_upload_volume'
  | 'insufficient_migration_signal';

export interface ActivationEvidenceEvaluation {
  readonly passed: boolean;
  readonly reason: ActivationEvidenceDecisionReason;
  readonly evidence: BulkPressPhotoActivationEvidence;
  readonly thresholds: ActivationEvidenceThresholds;
}

function getLookbackStartDate(
  lookbackDays = ACTIVATION_EVIDENCE_LOOKBACK_DAYS
): Date {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - lookbackDays);
  return start;
}

function isEvidenceOverrideEnabled(): boolean {
  return process.env.BULK_PRESS_PHOTO_IMPORT_EVIDENCE_OVERRIDE === 'passed';
}

export async function collectBulkPressPhotoActivationEvidence(options?: {
  readonly lookbackDays?: number;
}): Promise<BulkPressPhotoActivationEvidence> {
  const lookbackDays =
    options?.lookbackDays ?? ACTIVATION_EVIDENCE_LOOKBACK_DAYS;
  const lookbackStart = getLookbackStartDate(lookbackDays);
  const manualPressPhotoFilter = and(
    eq(profilePhotos.photoType, 'press'),
    eq(profilePhotos.sourceType, 'manual'),
    inArray(profilePhotos.status, ['ready', 'draft', 'processing']),
    gte(profilePhotos.createdAt, lookbackStart)
  );

  const [manualUploadMetrics] = await db
    .select({
      manualUploadCount: count(),
      manualUploadProfiles: countDistinct(profilePhotos.creatorProfileId),
    })
    .from(profilePhotos)
    .where(manualPressPhotoFilter);

  const multiPhotoProfiles = await db
    .select({
      creatorProfileId: profilePhotos.creatorProfileId,
      photoCount: count(),
    })
    .from(profilePhotos)
    .where(manualPressPhotoFilter)
    .groupBy(profilePhotos.creatorProfileId)
    .having(drizzleSql`count(*) >= 2`);

  const [ingestedDraftMetrics] = await db
    .select({
      ingestedDraftCount: count(),
    })
    .from(profilePhotos)
    .where(
      and(
        eq(profilePhotos.photoType, 'press'),
        eq(profilePhotos.sourceType, 'ingested'),
        eq(profilePhotos.status, 'draft')
      )
    );

  const [avatarCandidateMetrics] = await db
    .select({
      avatarCandidateProfiles: countDistinct(
        creatorAvatarCandidates.creatorProfileId
      ),
    })
    .from(creatorAvatarCandidates)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, creatorAvatarCandidates.creatorProfileId)
    )
    .where(eq(creatorProfiles.isClaimed, true));

  return {
    lookbackDays,
    manualUploadCount: Number(manualUploadMetrics?.manualUploadCount ?? 0),
    manualUploadProfiles: Number(
      manualUploadMetrics?.manualUploadProfiles ?? 0
    ),
    profilesWithMultipleManualPressPhotos: multiPhotoProfiles.length,
    ingestedDraftCount: Number(ingestedDraftMetrics?.ingestedDraftCount ?? 0),
    avatarCandidateProfiles: Number(
      avatarCandidateMetrics?.avatarCandidateProfiles ?? 0
    ),
  };
}

export function evaluateActivationEvidence(
  evidence: BulkPressPhotoActivationEvidence,
  thresholds: ActivationEvidenceThresholds = DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS
): ActivationEvidenceEvaluation {
  if (isEvidenceOverrideEnabled()) {
    return {
      passed: true,
      reason: 'override_passed',
      evidence,
      thresholds,
    };
  }

  const hasManualUploadVolume =
    evidence.manualUploadCount >= thresholds.minManualUploadCount &&
    evidence.manualUploadProfiles >= thresholds.minManualUploadProfiles;

  if (hasManualUploadVolume) {
    return {
      passed: true,
      reason: 'manual_upload_volume',
      evidence,
      thresholds,
    };
  }

  const hasMigrationSignal =
    evidence.profilesWithMultipleManualPressPhotos >=
    thresholds.minProfilesWithMultipleManualPressPhotos;

  if (hasMigrationSignal) {
    return {
      passed: true,
      reason: 'multi_photo_migration_signal',
      evidence,
      thresholds,
    };
  }

  const reason =
    evidence.profilesWithMultipleManualPressPhotos > 0
      ? 'insufficient_migration_signal'
      : 'insufficient_manual_upload_volume';

  return {
    passed: false,
    reason,
    evidence,
    thresholds,
  };
}

export async function evaluateBulkPressPhotoActivationEvidence(options?: {
  readonly lookbackDays?: number;
  readonly thresholds?: ActivationEvidenceThresholds;
}): Promise<ActivationEvidenceEvaluation> {
  const evidence = await collectBulkPressPhotoActivationEvidence({
    lookbackDays: options?.lookbackDays,
  });

  return evaluateActivationEvidence(
    evidence,
    options?.thresholds ?? DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS
  );
}
