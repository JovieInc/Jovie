import 'server-only';

import { getAppFlagValue } from '@/lib/flags/server';
import { logger } from '@/lib/utils/logger';

import {
  type ActivationEvidenceEvaluation,
  evaluateBulkPressPhotoActivationEvidence,
} from './activation-evidence';

export type BulkPressPhotoImportGateReason =
  | 'allowed'
  | 'feature_flag_disabled'
  | 'activation_evidence_missing';

export interface BulkPressPhotoImportGateEvaluation {
  readonly allowed: boolean;
  readonly reason: BulkPressPhotoImportGateReason;
  readonly featureFlagEnabled: boolean;
  readonly activationEvidence: ActivationEvidenceEvaluation;
}

export async function evaluateBulkPressPhotoImportGate(options?: {
  readonly clerkUserId?: string | null;
}): Promise<BulkPressPhotoImportGateEvaluation> {
  const [featureFlagEnabled, activationEvidence] = await Promise.all([
    getAppFlagValue('BULK_PRESS_PHOTO_IMPORT', {
      userId: options?.clerkUserId ?? null,
    }),
    evaluateBulkPressPhotoActivationEvidence(),
  ]);

  if (!featureFlagEnabled) {
    return {
      allowed: false,
      reason: 'feature_flag_disabled',
      featureFlagEnabled,
      activationEvidence,
    };
  }

  if (!activationEvidence.passed) {
    return {
      allowed: false,
      reason: 'activation_evidence_missing',
      featureFlagEnabled,
      activationEvidence,
    };
  }

  return {
    allowed: true,
    reason: 'allowed',
    featureFlagEnabled,
    activationEvidence,
  };
}

export function logBulkPressPhotoImportGateDecision(
  evaluation: BulkPressPhotoImportGateEvaluation,
  context: {
    readonly creatorProfileId: string;
    readonly trigger: string;
  }
): void {
  if (evaluation.allowed) {
    logger.info('[press-photo-import-gate] Bulk import allowed', {
      creatorProfileId: context.creatorProfileId,
      trigger: context.trigger,
      activationReason: evaluation.activationEvidence.reason,
      evidence: evaluation.activationEvidence.evidence,
    });
    return;
  }

  logger.info('[press-photo-import-gate] Bulk import blocked', {
    creatorProfileId: context.creatorProfileId,
    trigger: context.trigger,
    gateReason: evaluation.reason,
    activationReason: evaluation.activationEvidence.reason,
    evidence: evaluation.activationEvidence.evidence,
  });
}
