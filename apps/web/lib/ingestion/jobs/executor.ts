import { eq } from 'drizzle-orm';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { enqueueFollowupIngestionJobs } from '../followup';
import { normalizeAndMergeExtraction } from '../merge';
import { withSystemIngestionSession } from '../session';
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
 * This reduces duplication across processBeaconsJob, processLayloJob, etc.
 *
 * Transaction discipline (JOV-10139): the executor owns short, DB-only
 * transaction phases via withSystemIngestionSession and NEVER holds a
 * transaction across `config.fetchAndExtract`. External HTTP inside an open
 * transaction leaves the Postgres session idle-in-transaction until Neon's
 * idle_in_transaction_session_timeout terminates the connection.
 */
export async function executeIngestionJob<TPayload extends BaseJobPayload>(
  jobPayload: unknown,
  config: JobExecutorConfig<TPayload>
): Promise<JobExecutionResult> {
  const parsed = config.payloadSchema.parse(jobPayload);

  // Phase 1 — short DB-only transaction: load the profile and mark processing.
  const profile = await withSystemIngestionSession(async tx => {
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

    return profile;
  });

  // Phase 2 — external I/O with NO transaction open, then Phase 3 — short
  // DB-only transaction: merge + followups + idle. On any failure, mark the
  // profile failed in its own short session so a dead or aborted phase can
  // never poison the failure bookkeeping.
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

    return await withSystemIngestionSession(async tx => {
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
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `${config.platformName} ingestion failed`;
    await withSystemIngestionSession(async tx => {
      await tx
        .update(creatorProfiles)
        .set({
          ingestionStatus: 'failed',
          lastIngestionError: message,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profile.id));
    });
    throw error;
  }
}
