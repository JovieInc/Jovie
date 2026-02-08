'server-only';

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
import {
  CANVAS_DEFAULT_DURATION_SEC,
  CANVAS_GENERATION_DIMENSIONS,
  SPOTIFY_CANVAS_SPEC,
} from './specs';
import type {
  CanvasGenerationInput,
  CanvasGenerationJob,
  CanvasGenerationResult,
  CanvasGenerationStatus,
  CanvasStatus,
} from './types';

// ---------------------------------------------------------------------------
// In-memory job tracking (will move to DB table when we build the full UI)
// ---------------------------------------------------------------------------

const activeJobs = new Map<string, CanvasGenerationJob>();

/**
 * Get the canvas status for a release from its metadata.
 * Canvas status is stored in the release's metadata JSONB field.
 */
export function getCanvasStatusFromMetadata(
  metadata: Record<string, unknown> | null
): CanvasStatus {
  if (!metadata) return 'unknown';
  const status = metadata.canvasStatus;
  if (status === 'not_set' || status === 'generated' || status === 'uploaded') {
    return status;
  }
  return 'unknown';
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

  // Basic URL validation
  try {
    new URL(artworkUrl);
  } catch {
    return { valid: false, error: 'Invalid artwork URL' };
  }

  return { valid: true };
}

/**
 * Build the AI prompt for processing album artwork before video generation.
 *
 * This prompt instructs the AI to:
 * 1. Remove any text/logos from the artwork
 * 2. Upscale to canvas dimensions
 * 3. Prepare for animation
 */
export function buildArtworkProcessingPrompt(
  input: CanvasGenerationInput
): string {
  const removeText = input.style?.removeText !== false; // default true
  const upscale = input.style?.upscale !== false; // default true

  const steps: string[] = [];

  if (removeText) {
    steps.push(
      'Remove all text, logos, and watermarks from the album artwork while preserving the visual style and composition.'
    );
  }

  if (upscale) {
    steps.push(
      `Upscale the artwork to ${CANVAS_GENERATION_DIMENSIONS.width}x${CANVAS_GENERATION_DIMENSIONS.height} pixels (9:16 portrait) using AI upscaling. Maintain image quality and add detail where needed.`
    );
  }

  steps.push(
    'Ensure the final image is clean, high-quality, and suitable for animation.'
  );

  return steps.join('\n');
}

/**
 * Build the AI prompt for generating a canvas video from processed artwork.
 */
export function buildVideoGenerationPrompt(
  input: CanvasGenerationInput
): string {
  const motionType = input.style?.motionType ?? 'ambient';
  const durationSec = CANVAS_DEFAULT_DURATION_SEC;

  const motionDescriptions: Record<string, string> = {
    zoom: 'a slow, smooth zoom into the center of the artwork, creating depth and focus',
    pan: 'a gentle horizontal or vertical pan across the artwork, revealing details',
    particles:
      'subtle floating particles or light effects overlaid on the artwork',
    morph:
      'subtle morphing and breathing effects that make the artwork feel alive',
    ambient:
      'subtle ambient motion with gentle color shifts and soft movement that creates a mesmerizing loop',
  };

  const motionDescription =
    motionDescriptions[motionType] ?? motionDescriptions.ambient;

  return `Generate a ${durationSec}-second looping video for Spotify Canvas.

**Source:** Album artwork for "${input.releaseTitle}" by ${input.artistName}
**Motion:** Create ${motionDescription}.
**Requirements:**
- ${CANVAS_GENERATION_DIMENSIONS.width}x${CANVAS_GENERATION_DIMENSIONS.height} pixels (9:16 portrait)
- ${SPOTIFY_CANVAS_SPEC.fps} fps
- Seamless loop (end frame should blend smoothly back to start)
- No text or UI elements
- Mood should match the artwork's visual tone
- H.264 codec, MP4 container`;
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
  unknown: number;
  releasesNeedingCanvas: Array<{
    id: string;
    title: string;
    hasArtwork: boolean;
  }>;
} {
  let withCanvas = 0;
  let withoutCanvas = 0;
  let unknown = 0;
  const releasesNeedingCanvas: Array<{
    id: string;
    title: string;
    hasArtwork: boolean;
  }> = [];

  for (const release of releases) {
    const status = getCanvasStatusFromMetadata(release.metadata);
    switch (status) {
      case 'uploaded':
      case 'generated':
        withCanvas++;
        break;
      case 'not_set':
        withoutCanvas++;
        releasesNeedingCanvas.push({
          id: release.id,
          title: release.title,
          hasArtwork: Boolean(release.artworkUrl),
        });
        break;
      default:
        unknown++;
        releasesNeedingCanvas.push({
          id: release.id,
          title: release.title,
          hasArtwork: Boolean(release.artworkUrl),
        });
        break;
    }
  }

  return {
    total: releases.length,
    withCanvas,
    withoutCanvas,
    unknown,
    releasesNeedingCanvas,
  };
}
