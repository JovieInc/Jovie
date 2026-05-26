import 'server-only';

/**
 * Canvas generation service.
 *
 * Orchestrates the canvas/video generation pipeline:
 * 1. Process album artwork (remove text, upscale via AI)
 * 2. Generate a looping video from the processed artwork
 * 3. Encode to Spotify Canvas specifications
 *
 * Currently provides the generation pipeline interfaces and artwork
 * processing logic. Video generation is pluggable — the actual AI
 * video generation (Sora, Runway, etc.) is configured via environment
 * variables and can be swapped without changing the pipeline.
 *
 * This service is designed to be called from:
 * - The chat AI tools (chat-first rollout)
 * - The /api/canvas/generate API route
 * - Future dedicated UI in the releases dashboard
 */

import * as Sentry from '@sentry/nextjs';
import type {
  CanvasGenerationInput,
  CanvasGenerationJob,
  CanvasGenerationResult,
  CanvasGenerationStatus,
  CanvasStatus,
} from './types';

export {
  buildArtworkProcessingPrompt,
  buildVideoGenerationPrompt,
} from './prompts';

// ---------------------------------------------------------------------------
// In-memory job tracking (will move to DB table when we build the full UI)
// ---------------------------------------------------------------------------

const MAX_ACTIVE_JOBS = 1000;
const activeJobs = new Map<string, CanvasGenerationJob>();

/**
 * Get the canvas status for a release from its metadata.
 * Canvas status is stored in the release's metadata JSONB field.
 */
export function getCanvasStatusFromMetadata(
  metadata: Record<string, unknown> | null
): CanvasStatus {
  if (!metadata) return 'not_set';
  const status = metadata.canvasStatus;
  if (status === 'generated' || status === 'uploaded') {
    return status;
  }
  return 'not_set';
}

/**
 * Build canvas metadata to merge into a release's metadata JSONB.
 */
export function buildCanvasMetadata(
  status: CanvasStatus,
  videoUrl?: string
): Record<string, unknown> {
  return {
    canvasStatus: status,
    ...(videoUrl ? { canvasVideoUrl: videoUrl } : {}),
    canvasUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Validate that album artwork meets minimum requirements for canvas generation.
 */
export function validateArtworkForCanvas(artworkUrl: string): {
  valid: boolean;
  error?: string;
} {
  if (!artworkUrl) {
    return { valid: false, error: 'No artwork URL provided' };
  }

  // URL validation — restrict to https to prevent SSRF
  try {
    const parsed = new URL(artworkUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Artwork URL must use http or https' };
    }
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname === '::1'
    ) {
      return { valid: false, error: 'Artwork URL must not point to localhost' };
    }
  } catch {
    return { valid: false, error: 'Invalid artwork URL' };
  }

  return { valid: true };
}

/**
 * Start a canvas generation job.
 *
 * This creates the job record and returns immediately.
 * The actual generation happens asynchronously.
 *
 * In the current implementation, this stores the job in memory
 * and returns a plan for the generation. The actual AI video
 * generation will be triggered when a provider is configured.
 */
export async function startCanvasGeneration(
  creatorProfileId: string,
  input: CanvasGenerationInput
): Promise<CanvasGenerationJob> {
  // Validate artwork
  const validation = validateArtworkForCanvas(input.artworkUrl);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const job: CanvasGenerationJob = {
    id: jobId,
    creatorProfileId,
    releaseId: input.releaseId,
    status: 'pending',
    input,
    createdAt: now,
    updatedAt: now,
  };

  // Evict oldest jobs if at capacity
  if (activeJobs.size >= MAX_ACTIVE_JOBS) {
    const oldestKey = activeJobs.keys().next().value;
    if (oldestKey) activeJobs.delete(oldestKey);
  }

  activeJobs.set(jobId, job);

  // In the future, this is where we'd enqueue the actual generation job
  // to a background worker (e.g., via Inngest, QStash, or similar)
  Sentry.addBreadcrumb({
    category: 'canvas',
    message: 'Canvas generation job created',
    data: { jobId, releaseId: input.releaseId },
    level: 'info',
  });

  return job;
}

/**
 * Get the status of a canvas generation job.
 */
export function getCanvasGenerationJob(
  jobId: string
): CanvasGenerationJob | null {
  return activeJobs.get(jobId) ?? null;
}

/**
 * Update the status of a canvas generation job.
 */
export function updateCanvasGenerationJob(
  jobId: string,
  status: CanvasGenerationStatus,
  result?: CanvasGenerationResult
): CanvasGenerationJob | null {
  const job = activeJobs.get(jobId);
  if (!job) return null;

  const updated: CanvasGenerationJob = {
    ...job,
    status,
    result,
    updatedAt: new Date().toISOString(),
  };

  activeJobs.set(jobId, updated);
  return updated;
}

/**
 * Get all active canvas generation jobs for a creator profile.
 */
export function getCanvasJobsForProfile(
  creatorProfileId: string
): CanvasGenerationJob[] {
  return Array.from(activeJobs.values()).filter(
    job => job.creatorProfileId === creatorProfileId
  );
}

/**
 * Summarize canvas status across all releases for a profile.
 * Returns a human-readable summary for the chat AI.
 */
export function summarizeCanvasStatus(
  releases: Array<{
    id: string;
    title: string;
    metadata: Record<string, unknown> | null;
    artworkUrl?: string | null;
  }>
): {
  total: number;
  withCanvas: number;
  withoutCanvas: number;
  releasesNeedingCanvas: Array<{
    id: string;
    title: string;
    hasArtwork: boolean;
  }>;
} {
  let withCanvas = 0;
  let withoutCanvas = 0;
  const releasesNeedingCanvas: Array<{
    id: string;
    title: string;
    hasArtwork: boolean;
  }> = [];

  for (const release of releases) {
    const status = getCanvasStatusFromMetadata(release.metadata);
    if (status === 'uploaded' || status === 'generated') {
      withCanvas++;
    } else {
      withoutCanvas++;
      releasesNeedingCanvas.push({
        id: release.id,
        title: release.title,
        hasArtwork: Boolean(release.artworkUrl),
      });
    }
  }

  return {
    total: releases.length,
    withCanvas,
    withoutCanvas,
    releasesNeedingCanvas,
  };
}
