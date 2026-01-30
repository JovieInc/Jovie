import { z } from 'zod';
import type { DbType } from '@/lib/db';
import type { ExtractionResult } from '../types';

/**
 * Base payload type for all ingestion jobs.
 */
export interface BaseJobPayload {
  creatorProfileId: string;
  sourceUrl: string;
  depth: number;
  dedupKey?: string;
}

/**
 * Profile data fetched for ingestion processing.
 */
export interface ProfileData {
  id: string;
  usernameNormalized: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  avatarLockedByUser: boolean | null;
  displayNameLocked: boolean | null;
}

/**
 * Configuration for a job executor.
 * Defines the schema, platform name, and fetch/extract logic for a job type.
 */
export interface JobExecutorConfig<TPayload extends BaseJobPayload> {
  /** Zod schema to validate and parse the job payload */
  payloadSchema: z.ZodSchema<TPayload>;
  /** Human-readable platform name for error messages */
  platformName: string;
  /** Platform-specific logic to fetch and extract data */
  fetchAndExtract: (
    payload: TPayload,
    profile: ProfileData
  ) => Promise<ExtractionResult>;
}

/**
 * Result of executing an ingestion job.
 */
export interface JobExecutionResult {
  inserted: number;
  updated: number;
  sourceUrl: string;
  extractedLinks: number;
}

/**
 * Supported recursive job types for follow-up ingestion.
 */
export type SupportedRecursiveJobType =
  | 'import_linktree'
  | 'import_laylo'
  | 'import_youtube'
  | 'import_beacons'
  | 'import_instagram'
  | 'import_tiktok'
  | 'import_twitter';

/**
 * Maximum depth allowed for each job type.
 */
export const MAX_DEPTH_BY_JOB_TYPE: Record<SupportedRecursiveJobType, number> =
  {
    import_linktree: 3,
    import_laylo: 3,
    import_youtube: 1,
    import_beacons: 3,
    import_instagram: 2,
    import_tiktok: 2,
    import_twitter: 2,
  };

/**
 * Job failure reason for backoff calculation.
 */
export type JobFailureReason = 'rate_limited' | 'transient';

/**
 * Job processor function signature.
 */
export type JobProcessor = (
  tx: DbType,
  jobPayload: unknown
) => Promise<JobExecutionResult>;
