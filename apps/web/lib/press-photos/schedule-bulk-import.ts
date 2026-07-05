import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { ingestDspPressPhotos } from '@/lib/dsp-enrichment/jobs/press-photo-ingestion';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

import {
  evaluateBulkPressPhotoImportGate,
  logBulkPressPhotoImportGateDecision,
} from './bulk-import-gate';

export interface ScheduleBulkPressPhotoImportParams {
  readonly creatorProfileId: string;
  readonly trigger: string;
}

export interface ScheduleBulkPressPhotoImportResult {
  readonly scheduled: boolean;
  readonly gateReason: string;
  readonly photosIngested?: number;
  readonly photosSkipped?: number;
}

async function resolveProfileOwners(creatorProfileId: string): Promise<{
  userId: string;
  clerkUserId: string;
} | null> {
  const [row] = await db
    .select({
      userId: creatorProfiles.userId,
      clerkUserId: users.clerkId,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!row?.userId || !row.clerkUserId) {
    return null;
  }

  return {
    userId: row.userId,
    clerkUserId: row.clerkUserId,
  };
}

/**
 * Attempt DSP bulk press-photo import only when the Statsig gate and
 * platform activation evidence both pass. Single-photo manual upload remains
 * the default path regardless of this gate.
 */
export async function scheduleBulkPressPhotoImportIfEligible(
  params: ScheduleBulkPressPhotoImportParams
): Promise<ScheduleBulkPressPhotoImportResult> {
  const owners = await resolveProfileOwners(params.creatorProfileId);
  if (!owners) {
    logger.warn('[press-photo-import-gate] Profile owners missing for import', {
      creatorProfileId: params.creatorProfileId,
      trigger: params.trigger,
    });
    return {
      scheduled: false,
      gateReason: 'profile_not_found',
    };
  }

  const gate = await evaluateBulkPressPhotoImportGate({
    clerkUserId: owners.clerkUserId,
  });
  logBulkPressPhotoImportGateDecision(gate, {
    creatorProfileId: params.creatorProfileId,
    trigger: params.trigger,
  });

  if (!gate.allowed) {
    return {
      scheduled: false,
      gateReason: gate.reason,
    };
  }

  try {
    const result = await ingestDspPressPhotos(
      params.creatorProfileId,
      owners.userId,
      owners.clerkUserId
    );

    logger.info('[press-photo-import-gate] Bulk import completed', {
      creatorProfileId: params.creatorProfileId,
      trigger: params.trigger,
      photosIngested: result.photosIngested,
      photosSkipped: result.photosSkipped,
      errors: result.errors,
    });

    return {
      scheduled: true,
      gateReason: gate.reason,
      photosIngested: result.photosIngested,
      photosSkipped: result.photosSkipped,
    };
  } catch (error) {
    await captureError(
      'Bulk press photo import failed after gate passed',
      error,
      {
        creatorProfileId: params.creatorProfileId,
        trigger: params.trigger,
      }
    );
    throw error;
  }
}
