import { eq } from 'drizzle-orm';
import { creatorProfiles, type DbOrTransaction } from '@/lib/db';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { enqueueFollowupIngestionJobs } from '../followup';
import { normalizeAndMergeExtraction } from '../merge';
import type {
  BaseJobPayload,
  JobExecutionResult,
  JobExecutorConfig,
} from './types';

function resolveSourcePlatform(
  extractionPlatform: string | null | undefined,
  detected: ReturnType<typeof detectPlatform>
): string | null {
  if (extractionPlatform) return extractionPlatform;
  if (detected.isValid) return detected.platform.id;
  return null;
}

/**
 * Generic job executor that handles the common workflow for all ingestion jobs.
 * This reduces duplication across processLinktreeJob, processLayloJob, etc.
 */
export async function executeIngestionJob<TPayload extends BaseJobPayload>(
  tx: DbOrTransaction,
  jobPayload: unknown,
  config: JobExecutorConfig<TPayload>
): Promise<JobExecutionResult> {
  const parsed = config.payloadSchema.parse(jobPayload);

  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      avatarUrl: creatorProfiles.avatarUrl,
      displayName: creatorProfiles.displayName,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      displayNameLocked: creatorProfiles.displayNameLocked,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, parsed.creatorProfileId))
    .limit(1);

  if (!profile) {
    throw new Error('Creator profile not found for ingestion job');
  }

  await tx
    .update(creatorProfiles)
    .set({ ingestionStatus: 'processing', updatedAt: new Date() })
    .where(eq(creatorProfiles.id, profile.id));

  try {
    const extraction = await config.fetchAndExtract(parsed, profile);
    const detected = detectPlatform(parsed.sourceUrl);
    const extractionWithProvenance = {
      ...extraction,
      sourceUrl: extraction.sourceUrl ?? parsed.sourceUrl,
      sourcePlatform: resolveSourcePlatform(
        extraction.sourcePlatform,
        detected
      ),
    };
    const result = await normalizeAndMergeExtraction(
      tx,
      profile,
      extractionWithProvenance
    );

    await enqueueFollowupIngestionJobs({
      tx,
      creatorProfileId: profile.id,
      currentDepth: parsed.depth,
      extraction: extractionWithProvenance,
    });

    await tx
      .update(creatorProfiles)
      .set({ ingestionStatus: 'idle', updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profile.id));

    return {
      ...result,
      sourceUrl: parsed.sourceUrl,
      extractedLinks: extraction.links.length,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `${config.platformName} ingestion failed`;
    await tx
      .update(creatorProfiles)
      .set({
        ingestionStatus: 'failed',
        lastIngestionError: message,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));
    throw error;
  }
}
