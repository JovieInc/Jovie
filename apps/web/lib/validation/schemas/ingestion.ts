import { z } from 'zod';

import { uuidSchema } from './base';

/**
 * Ingestion Job Payload Schemas
 *
 * Pre-instantiated schemas for ingestion job payloads.
 * These schemas validate the payload structure for various platform ingestion jobs.
 *
 * Two variants exist:
 * - Base schemas (dedupKey optional): Used by processor.ts for internal job processing
 * - Job schemas (dedupKey required): Used by jobs.ts for job enqueueing with deduplication
 */

// =============================================================================
// Shared Constants
// =============================================================================

/**
 * Maximum depth values by platform.
 * Used to limit recursive ingestion crawling.
 */
export const INGESTION_MAX_DEPTH = {
  linktree: 3,
  laylo: 3,
  youtube: 1,
  beacons: 3,
  thematic: 1,
} as const;

// =============================================================================
// Base Payload Schemas (dedupKey optional - for processor.ts)
// =============================================================================

/**
 * Base ingestion payload schema with optional dedupKey.
 * Used by processor.ts for job execution where dedupKey may not be present.
 */
const createBaseIngestionPayloadSchema = (maxDepth: number) =>
  z.object({
    creatorProfileId: uuidSchema,
    sourceUrl: z.string().url(),
    dedupKey: z.string().optional(),
    depth: z.number().int().min(0).max(maxDepth).default(0),
  });

/**
 * Linktree ingestion payload schema (processor variant).
 * Used when processing import_linktree jobs.
 */
export const linktreePayloadSchema = createBaseIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.linktree
);

/**
 * Laylo ingestion payload schema (processor variant).
 * Used when processing import_laylo jobs.
 */
export const layloPayloadSchema = createBaseIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.laylo
);

/**
 * YouTube ingestion payload schema (processor variant).
 * Used when processing import_youtube jobs.
 * Limited to depth 1 since YouTube doesn't have nested link trees.
 */
export const youtubePayloadSchema = createBaseIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.youtube
);

/**
 * Beacons ingestion payload schema (processor variant).
 * Used when processing import_beacons jobs.
 */
export const beaconsPayloadSchema = createBaseIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.beacons
);

/**
 * Thematic ingestion payload schema (processor variant).
 * Used when processing import_thematic jobs.
 * Limited to depth 1 since Thematic doesn't have nested link trees.
 */
export const thematicPayloadSchema = createBaseIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.thematic
);

// =============================================================================
// Job Payload Schemas (dedupKey required - for jobs.ts)
// =============================================================================

/**
 * Job ingestion payload schema with required dedupKey.
 * Used by jobs.ts when enqueueing jobs that need deduplication.
 */
const createJobIngestionPayloadSchema = (maxDepth: number) =>
  z.object({
    creatorProfileId: uuidSchema,
    sourceUrl: z.string().url(),
    dedupKey: z.string(),
    depth: z.number().int().min(0).max(maxDepth).default(0),
  });

/**
 * Linktree job payload schema (enqueue variant).
 * Used when creating import_linktree jobs with deduplication.
 */
export const linktreeJobPayloadSchema = createJobIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.linktree
);

/**
 * Laylo job payload schema (enqueue variant).
 * Used when creating import_laylo jobs with deduplication.
 */
export const layloJobPayloadSchema = createJobIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.laylo
);

/**
 * YouTube job payload schema (enqueue variant).
 * Used when creating import_youtube jobs with deduplication.
 */
export const youtubeJobPayloadSchema = createJobIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.youtube
);

/**
 * Beacons job payload schema (enqueue variant).
 * Used when creating import_beacons jobs with deduplication.
 */
export const beaconsJobPayloadSchema = createJobIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.beacons
);

/**
 * Thematic job payload schema (enqueue variant).
 * Used when creating import_thematic jobs with deduplication.
 */
export const thematicJobPayloadSchema = createJobIngestionPayloadSchema(
  INGESTION_MAX_DEPTH.thematic
);

// =============================================================================
// Inferred Types
// =============================================================================

/**
 * Inferred type for base ingestion payloads (dedupKey optional).
 */
export type LinktreePayload = z.infer<typeof linktreePayloadSchema>;
export type LayloPayload = z.infer<typeof layloPayloadSchema>;
export type YouTubePayload = z.infer<typeof youtubePayloadSchema>;
export type BeaconsPayload = z.infer<typeof beaconsPayloadSchema>;
export type ThematicPayload = z.infer<typeof thematicPayloadSchema>;

/**
 * Inferred type for job ingestion payloads (dedupKey required).
 */
export type LinktreeJobPayload = z.infer<typeof linktreeJobPayloadSchema>;
export type LayloJobPayload = z.infer<typeof layloJobPayloadSchema>;
export type YouTubeJobPayload = z.infer<typeof youtubeJobPayloadSchema>;
export type BeaconsJobPayload = z.infer<typeof beaconsJobPayloadSchema>;
export type ThematicJobPayload = z.infer<typeof thematicJobPayloadSchema>;
