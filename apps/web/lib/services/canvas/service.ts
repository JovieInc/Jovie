import 'server-only';

import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as Sentry from '@sentry/nextjs';
import { and, desc, sql as drizzleSql, eq, inArray, or } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/lib/db';
import {
  type CanvasArtifact,
  type CanvasGeneration,
  type CanvasImageMaster,
  canvasArtifacts,
  canvasGenerations,
  canvasImageMasters,
  type TrackCanvasState,
  trackCanvasState,
} from '@/lib/db/schema/canvas';
import {
  discogReleases,
  discogReleaseTracks,
  discogTracks,
} from '@/lib/db/schema/content';
import { logger } from '@/lib/utils/logger';
import {
  CANVAS_DEFAULT_DURATION_SEC,
  CANVAS_GENERATION_DIMENSIONS,
  SPOTIFY_CANVAS_SPEC,
} from './specs';
import { readCanvasArtifact, storeCanvasArtifact } from './storage';
import type {
  CanvasArtifactRecord,
  CanvasGenerationInput,
  CanvasGenerationRecord,
  CanvasGenerationResult,
  CanvasGenerationStage,
  CanvasMotionPreset,
  CanvasStatus,
  CanvasStyle,
  CanvasVideoSpec,
  TrackCanvasHistory,
  TrackCanvasStatus,
  TrackCanvasSummary,
} from './types';

const execFile = promisify(execFileCallback);
const ACTIVE_GENERATION_WINDOW_MS = 30 * 60 * 1000;
const ARTWORK_FETCH_TIMEOUT_MS = 15_000;
const ARTWORK_FETCH_RETRIES = 2;
const IMAGE_MASTER_PROVIDER = 'jovie-sharp';
const IMAGE_MASTER_MODEL = 'canvas-expand-v1';
const VIDEO_PROVIDER = 'jovie-ffmpeg';
const VIDEO_MODEL = 'zoompan-v1';
const CANVAS_FPS = SPOTIFY_CANVAS_SPEC.fps;

type TrackReference = {
  readonly releaseTrackId: string | null;
  readonly legacyTrackId: string | null;
};

type GenerationRow = typeof canvasGenerations.$inferSelect;
type ArtifactRow = typeof canvasArtifacts.$inferSelect;

function toIsoString(
  value: Date | string | null | undefined
): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function toTrackReference(
  trackId: string,
  releaseTrackId?: string
): TrackReference {
  return {
    releaseTrackId: releaseTrackId ?? null,
    legacyTrackId: releaseTrackId ? null : trackId,
  };
}

function buildTrackReferenceClause(trackRef: TrackReference) {
  return trackRef.releaseTrackId
    ? eq(canvasGenerations.releaseTrackId, trackRef.releaseTrackId)
    : eq(canvasGenerations.legacyTrackId, trackRef.legacyTrackId!);
}

function buildTrackStateClause(trackRef: TrackReference) {
  return trackRef.releaseTrackId
    ? eq(trackCanvasState.releaseTrackId, trackRef.releaseTrackId)
    : eq(trackCanvasState.legacyTrackId, trackRef.legacyTrackId!);
}

function normalizeTrackCanvasStatus(
  value: string | null | undefined
): TrackCanvasStatus {
  switch (value) {
    case 'queued':
    case 'processing':
    case 'ready':
    case 'uploaded':
    case 'failed':
      return value;
    default:
      return 'not_set';
  }
}

function normalizeReleaseCanvasStatus(
  value: string | null | undefined
): CanvasStatus {
  switch (value) {
    case 'processing':
    case 'generated':
    case 'uploaded':
      return value;
    default:
      return 'not_set';
  }
}

function normalizeGenerationStage(
  value: string | null | undefined
): CanvasGenerationStage {
  switch (value) {
    case 'queued':
    case 'preparing_image':
    case 'repairing_image':
    case 'generating_video':
    case 'encoding':
    case 'validating':
    case 'completed':
    case 'failed':
      return value;
    default:
      return 'queued';
  }
}

function mapArtifactRecord(artifact: ArtifactRow): CanvasArtifactRecord {
  return {
    id: artifact.id,
    generationId: artifact.generationId,
    kind: artifact.kind as CanvasArtifactRecord['kind'],
    storagePath: artifact.storagePath,
    mimeType: artifact.mimeType,
    width: artifact.width,
    height: artifact.height,
    durationSec: artifact.durationSec,
    fileSizeBytes: artifact.fileSizeBytes,
    createdAt: artifact.createdAt.toISOString(),
  };
}

function mapGenerationRecord(
  generation: GenerationRow,
  artifacts: readonly ArtifactRow[]
): CanvasGenerationRecord {
  const trackId = generation.releaseTrackId ?? generation.legacyTrackId ?? '';
  return {
    id: generation.id,
    releaseId: generation.releaseId,
    trackId,
    releaseTrackId: generation.releaseTrackId ?? undefined,
    imageMasterId: generation.imageMasterId,
    status: normalizeTrackCanvasStatus(generation.status),
    stage: normalizeGenerationStage(generation.stage),
    motionPreset: generation.motionPreset as CanvasMotionPreset,
    provider: generation.provider,
    model: generation.model,
    durationSec: generation.durationSec,
    loopStrategy: generation.loopStrategy,
    failureCode: generation.failureCode,
    failureMessage: generation.failureMessage,
    qc: generation.qc ?? {},
    metadata: generation.metadata ?? {},
    createdAt: generation.createdAt.toISOString(),
    startedAt: toIsoString(generation.startedAt),
    completedAt: toIsoString(generation.completedAt),
    artifacts: artifacts.map(mapArtifactRecord),
  };
}

export function getCanvasStatusFromMetadata(
  metadata: Record<string, unknown> | null
): CanvasStatus {
  if (!metadata) return 'not_set';
  return normalizeReleaseCanvasStatus(
    metadata.canvasStatus as string | undefined
  );
}

export function buildCanvasMetadata(
  status: CanvasStatus,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    canvasStatus: status,
    canvasUpdatedAt: new Date().toISOString(),
    ...extra,
  };
}

export function deriveReleaseCanvasStatus(
  statuses: readonly TrackCanvasStatus[]
): CanvasStatus {
  if (statuses.length === 0) {
    return 'not_set';
  }
  if (statuses.some(status => status === 'queued' || status === 'processing')) {
    return 'processing';
  }
  if (statuses.every(status => status === 'uploaded')) {
    return 'uploaded';
  }
  if (statuses.some(status => status === 'ready' || status === 'uploaded')) {
    return 'generated';
  }
  return 'not_set';
}

export function summarizeCanvasStatus(
  releases: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly metadata: Record<string, unknown> | null;
    readonly artworkUrl?: string | null;
  }>
): {
  readonly total: number;
  readonly withCanvas: number;
  readonly withoutCanvas: number;
  readonly releasesNeedingCanvas: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly hasArtwork: boolean;
  }>;
} {
  const releasesNeedingCanvas = releases
    .filter(
      release => getCanvasStatusFromMetadata(release.metadata) === 'not_set'
    )
    .map(release => ({
      id: release.id,
      title: release.title,
      hasArtwork: Boolean(release.artworkUrl),
    }));

  return {
    total: releases.length,
    withCanvas: releases.length - releasesNeedingCanvas.length,
    withoutCanvas: releasesNeedingCanvas.length,
    releasesNeedingCanvas,
  };
}

export function validateArtworkForCanvas(artworkUrl: string): {
  valid: boolean;
  error?: string;
} {
  if (!artworkUrl) {
    return { valid: false, error: 'No artwork URL provided' };
  }

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

export function buildArtworkProcessingPrompt(
  input: CanvasGenerationInput
): string {
  const removeText = input.style?.removeText !== false;
  const upscale = input.style?.upscale !== false;
  const steps: string[] = [];

  if (removeText) {
    steps.push(
      'Remove artwork text and overlays while preserving the original palette and subject.'
    );
  }

  if (upscale) {
    steps.push(
      `Expand and upscale the artwork to ${CANVAS_GENERATION_DIMENSIONS.width}x${CANVAS_GENERATION_DIMENSIONS.height}.`
    );
  }

  steps.push('Preserve a centered safe composition for Spotify Canvas.');
  return steps.join(' ');
}

export function buildVideoGenerationPrompt(
  input: CanvasGenerationInput
): string {
  return `Create a ${CANVAS_DEFAULT_DURATION_SEC}-second seamless 9:16 loop for ${input.releaseTitle} by ${input.artistName} using ${input.motionPreset ?? 'ambient'} motion.`;
}

async function fetchArtworkBuffer(artworkUrl: string): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= ARTWORK_FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetch(artworkUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(ARTWORK_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Artwork fetch failed with status ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt === ARTWORK_FETCH_RETRIES) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to fetch artwork');
}

async function ensureTempDir(prefix: string): Promise<string> {
  const baseDir = join(tmpdir(), prefix);
  await mkdir(baseDir, { recursive: true });
  return mkdtemp(join(baseDir, `${prefix}-`));
}

async function buildPreparedCanvasImages(params: {
  readonly artworkBuffer: Buffer;
}): Promise<{
  readonly processedPng: Buffer;
  readonly previewJpg: Buffer;
  readonly posterJpg: Buffer;
  readonly fingerprint: string;
  readonly qc: Record<string, unknown>;
}> {
  const fingerprint = createHash('sha256')
    .update(params.artworkBuffer)
    .digest('hex');

  const foreground = await sharp(params.artworkBuffer)
    .resize(880, 1560, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const background = await sharp(params.artworkBuffer)
    .resize(
      CANVAS_GENERATION_DIMENSIONS.width,
      CANVAS_GENERATION_DIMENSIONS.height,
      { fit: 'cover' }
    )
    .blur(18)
    .modulate({ brightness: 0.82, saturation: 1.05 })
    .png()
    .toBuffer();

  const processedPng = await sharp(background)
    .composite([{ input: foreground, gravity: 'center' }])
    .png()
    .toBuffer();

  const previewJpg = await sharp(processedPng)
    .resize(360, 640, { fit: 'cover' })
    .jpeg({ quality: 84 })
    .toBuffer();

  const posterJpg = await sharp(processedPng).jpeg({ quality: 88 }).toBuffer();

  const metadata = await sharp(params.artworkBuffer).metadata();

  return {
    processedPng,
    previewJpg,
    posterJpg,
    fingerprint,
    qc: {
      sourceWidth: metadata.width ?? null,
      sourceHeight: metadata.height ?? null,
      strategy: 'sharp-safe-center-expand',
      textRemovalMode: 'fallback_preserve',
    },
  };
}

async function runFfmpeg(args: readonly string[]): Promise<void> {
  try {
    await execFile('ffmpeg', args, { timeout: 120_000 });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'ffmpeg command failed'
    );
  }
}

async function runFfprobe(filePath: string): Promise<{
  readonly width: number;
  readonly height: number;
  readonly durationSec: number;
}> {
  const { stdout } = await execFile(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 30_000 }
  );

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };

  return {
    width: parsed.streams?.[0]?.width ?? 0,
    height: parsed.streams?.[0]?.height ?? 0,
    durationSec: Math.round(Number(parsed.format?.duration ?? '0')),
  };
}

async function renderCanvasVideos(params: {
  readonly processedImage: Buffer;
}): Promise<{
  readonly masterVideo: Buffer;
  readonly uploadVideo: Buffer;
  readonly posterJpg: Buffer;
  readonly masterProbe: { width: number; height: number; durationSec: number };
}> {
  const tempDir = await ensureTempDir('jovie-canvas');
  const sourcePath = join(tempDir, 'source.png');
  const masterPath = join(tempDir, 'master.mp4');
  const uploadPath = join(tempDir, 'upload.mp4');
  const posterPath = join(tempDir, 'poster.jpg');

  try {
    await writeFile(sourcePath, params.processedImage);

    await runFfmpeg([
      '-y',
      '-loop',
      '1',
      '-i',
      sourcePath,
      '-vf',
      `zoompan=z='min(zoom+0.00045,1.08)':d=${CANVAS_FPS * CANVAS_DEFAULT_DURATION_SEC}:s=${CANVAS_GENERATION_DIMENSIONS.width}x${CANVAS_GENERATION_DIMENSIONS.height}:fps=${CANVAS_FPS},format=yuv420p`,
      '-t',
      String(CANVAS_DEFAULT_DURATION_SEC),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      masterPath,
    ]);

    await runFfmpeg([
      '-y',
      '-i',
      masterPath,
      '-vf',
      'scale=720:1280:flags=lanczos',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      uploadPath,
    ]);

    await runFfmpeg(['-y', '-i', masterPath, '-frames:v', '1', posterPath]);

    const [masterVideo, uploadVideo, posterJpg, masterProbe] =
      await Promise.all([
        readFile(masterPath),
        readFile(uploadPath),
        readFile(posterPath),
        runFfprobe(masterPath),
      ]);

    return {
      masterVideo,
      uploadVideo,
      posterJpg,
      masterProbe,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function upsertTrackCanvasState(params: {
  readonly trackRef: TrackReference;
  readonly releaseId: string;
  readonly creatorProfileId: string;
  readonly status: TrackCanvasStatus;
  readonly currentGenerationId?: string | null;
  readonly uploadedGenerationId?: string | null;
  readonly lastGeneratedAt?: Date | null;
  readonly lastError?: string | null;
}): Promise<TrackCanvasState> {
  const existing = await db
    .select()
    .from(trackCanvasState)
    .where(buildTrackStateClause(params.trackRef))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(trackCanvasState)
      .set({
        status: params.status,
        currentGenerationId:
          params.currentGenerationId ?? existing[0].currentGenerationId,
        uploadedGenerationId:
          params.uploadedGenerationId ?? existing[0].uploadedGenerationId,
        lastGeneratedAt: params.lastGeneratedAt ?? existing[0].lastGeneratedAt,
        lastError: params.lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(trackCanvasState.id, existing[0].id))
      .returning();

    return updated;
  }

  const [inserted] = await db
    .insert(trackCanvasState)
    .values({
      releaseTrackId: params.trackRef.releaseTrackId,
      legacyTrackId: params.trackRef.legacyTrackId,
      releaseId: params.releaseId,
      creatorProfileId: params.creatorProfileId,
      status: params.status,
      currentGenerationId: params.currentGenerationId ?? null,
      uploadedGenerationId: params.uploadedGenerationId ?? null,
      lastGeneratedAt: params.lastGeneratedAt ?? null,
      lastError: params.lastError ?? null,
      updatedAt: new Date(),
    })
    .returning();

  return inserted;
}

async function updateGeneration(params: {
  readonly generationId: string;
  readonly status?: TrackCanvasStatus;
  readonly stage?: CanvasGenerationStage;
  readonly imageMasterId?: string | null;
  readonly failureCode?: string | null;
  readonly failureMessage?: string | null;
  readonly qc?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
}): Promise<CanvasGeneration> {
  const [updated] = await db
    .update(canvasGenerations)
    .set({
      ...(params.status ? { status: params.status } : {}),
      ...(params.stage ? { stage: params.stage } : {}),
      ...(params.imageMasterId !== undefined
        ? { imageMasterId: params.imageMasterId }
        : {}),
      ...(params.failureCode !== undefined
        ? { failureCode: params.failureCode }
        : {}),
      ...(params.failureMessage !== undefined
        ? { failureMessage: params.failureMessage }
        : {}),
      ...(params.qc !== undefined ? { qc: params.qc } : {}),
      ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      ...(params.startedAt !== undefined
        ? { startedAt: params.startedAt }
        : {}),
      ...(params.completedAt !== undefined
        ? { completedAt: params.completedAt }
        : {}),
    })
    .where(eq(canvasGenerations.id, params.generationId))
    .returning();

  return updated;
}

async function ensureImageMaster(params: {
  readonly creatorProfileId: string;
  readonly releaseId: string;
  readonly artworkUrl: string;
}): Promise<CanvasImageMaster> {
  const artworkBuffer = await fetchArtworkBuffer(params.artworkUrl);
  const prepared = await buildPreparedCanvasImages({ artworkBuffer });

  const existing = await db
    .select()
    .from(canvasImageMasters)
    .where(
      and(
        eq(canvasImageMasters.creatorProfileId, params.creatorProfileId),
        eq(canvasImageMasters.sourceArtworkFingerprint, prepared.fingerprint)
      )
    )
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const imageMasterId = randomUUID();
  const basePath = `canvas-image-masters/${params.creatorProfileId}/${prepared.fingerprint}/${imageMasterId}`;
  const processedImagePath = await storeCanvasArtifact({
    storagePath: `${basePath}.png`,
    buffer: prepared.processedPng,
    contentType: 'image/png',
  });
  const previewImagePath = await storeCanvasArtifact({
    storagePath: `${basePath}-preview.jpg`,
    buffer: prepared.previewJpg,
    contentType: 'image/jpeg',
  });
  const manifestPath = await storeCanvasArtifact({
    storagePath: `${basePath}-manifest.json`,
    buffer: Buffer.from(
      JSON.stringify(
        {
          artworkUrl: params.artworkUrl,
          fingerprint: prepared.fingerprint,
          qc: prepared.qc,
          provider: IMAGE_MASTER_PROVIDER,
          model: IMAGE_MASTER_MODEL,
        },
        null,
        2
      ),
      'utf8'
    ),
    contentType: 'application/json',
  });

  const [inserted] = await db
    .insert(canvasImageMasters)
    .values({
      id: imageMasterId,
      creatorProfileId: params.creatorProfileId,
      sourceArtworkUrl: params.artworkUrl,
      sourceArtworkFingerprint: prepared.fingerprint,
      releaseId: params.releaseId,
      processedImagePath,
      previewImagePath,
      provider: IMAGE_MASTER_PROVIDER,
      model: IMAGE_MASTER_MODEL,
      manifestPath,
      qc: prepared.qc,
      createdAt: new Date(),
    })
    .returning();

  return inserted;
}

async function loadGenerationsWithArtifacts(
  generationIds: readonly string[]
): Promise<Map<string, readonly ArtifactRow[]>> {
  if (generationIds.length === 0) {
    return new Map();
  }

  const artifacts = await db
    .select()
    .from(canvasArtifacts)
    .where(inArray(canvasArtifacts.generationId, generationIds));

  const grouped = new Map<string, ArtifactRow[]>();
  for (const artifact of artifacts) {
    const bucket = grouped.get(artifact.generationId) ?? [];
    bucket.push(artifact);
    grouped.set(artifact.generationId, bucket);
  }

  return grouped;
}

async function syncReleaseCanvasMetadata(releaseId: string): Promise<void> {
  const states = await db
    .select({ status: trackCanvasState.status })
    .from(trackCanvasState)
    .where(eq(trackCanvasState.releaseId, releaseId));

  const summaryStatus = deriveReleaseCanvasStatus(
    states.map(state => normalizeTrackCanvasStatus(state.status))
  );

  const [release] = await db
    .select({ metadata: discogReleases.metadata })
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  if (!release) {
    return;
  }

  await db
    .update(discogReleases)
    .set({
      metadata: {
        ...(release.metadata ?? {}),
        ...buildCanvasMetadata(summaryStatus, {
          canvasTrackSummary: {
            total: states.length,
            ready: states.filter(state => state.status === 'ready').length,
            uploaded: states.filter(state => state.status === 'uploaded')
              .length,
            processing: states.filter(
              state =>
                state.status === 'queued' || state.status === 'processing'
            ).length,
          },
        }),
      },
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, releaseId));
}

async function createArtifactsForGeneration(params: {
  readonly generationId: string;
  readonly creatorProfileId: string;
  readonly trackId: string;
  readonly masterVideo: Buffer;
  readonly uploadVideo: Buffer;
  readonly posterJpg: Buffer;
  readonly processedImagePath: string;
  readonly width: number;
  readonly height: number;
  readonly durationSec: number;
  readonly manifest: Record<string, unknown>;
}): Promise<readonly CanvasArtifact[]> {
  const basePath = `canvas/${params.creatorProfileId}/${params.trackId}/${params.generationId}`;

  const uploadVideoPath = await storeCanvasArtifact({
    storagePath: `${basePath}/upload.mp4`,
    buffer: params.uploadVideo,
    contentType: 'video/mp4',
  });
  const masterVideoPath = await storeCanvasArtifact({
    storagePath: `${basePath}/master.mp4`,
    buffer: params.masterVideo,
    contentType: 'video/mp4',
  });
  const posterPath = await storeCanvasArtifact({
    storagePath: `${basePath}/poster.jpg`,
    buffer: params.posterJpg,
    contentType: 'image/jpeg',
  });
  const manifestPath = await storeCanvasArtifact({
    storagePath: `${basePath}/manifest.json`,
    buffer: Buffer.from(JSON.stringify(params.manifest, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  return db
    .insert(canvasArtifacts)
    .values([
      {
        generationId: params.generationId,
        kind: 'image_master',
        storagePath: params.processedImagePath,
        mimeType: 'image/png',
        width: params.width,
        height: params.height,
        durationSec: null,
        fileSizeBytes: null,
      },
      {
        generationId: params.generationId,
        kind: 'upload_video',
        storagePath: uploadVideoPath,
        mimeType: 'video/mp4',
        width: 720,
        height: 1280,
        durationSec: params.durationSec,
        fileSizeBytes: params.uploadVideo.length,
      },
      {
        generationId: params.generationId,
        kind: 'master_video',
        storagePath: masterVideoPath,
        mimeType: 'video/mp4',
        width: params.width,
        height: params.height,
        durationSec: params.durationSec,
        fileSizeBytes: params.masterVideo.length,
      },
      {
        generationId: params.generationId,
        kind: 'poster',
        storagePath: posterPath,
        mimeType: 'image/jpeg',
        width: params.width,
        height: params.height,
        durationSec: null,
        fileSizeBytes: params.posterJpg.length,
      },
      {
        generationId: params.generationId,
        kind: 'manifest',
        storagePath: manifestPath,
        mimeType: 'application/json',
        width: null,
        height: null,
        durationSec: null,
        fileSizeBytes: null,
      },
    ])
    .returning();
}

async function getGenerationRow(
  generationId: string
): Promise<GenerationRow | null> {
  const [generation] = await db
    .select()
    .from(canvasGenerations)
    .where(eq(canvasGenerations.id, generationId))
    .limit(1);

  return generation ?? null;
}

export async function createCanvasGeneration(params: {
  readonly creatorProfileId: string;
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly artworkUrl: string;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly motionPreset?: CanvasMotionPreset;
}): Promise<CanvasGenerationRecord> {
  const validation = validateArtworkForCanvas(params.artworkUrl);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const trackRef = toTrackReference(params.trackId, params.releaseTrackId);
  const existing = await db
    .select()
    .from(canvasGenerations)
    .where(
      and(
        eq(canvasGenerations.releaseId, params.releaseId),
        buildTrackReferenceClause(trackRef),
        or(
          eq(canvasGenerations.status, 'queued'),
          eq(canvasGenerations.status, 'processing')
        ),
        drizzleSql`${canvasGenerations.createdAt} > ${new Date(
          Date.now() - ACTIVE_GENERATION_WINDOW_MS
        )}`
      )
    )
    .orderBy(desc(canvasGenerations.createdAt))
    .limit(1);

  if (existing[0]) {
    const artifactMap = await loadGenerationsWithArtifacts([existing[0].id]);
    return mapGenerationRecord(
      existing[0],
      artifactMap.get(existing[0].id) ?? []
    );
  }

  const generationId = randomUUID();
  const now = new Date();
  const [generation] = await db
    .insert(canvasGenerations)
    .values({
      id: generationId,
      releaseTrackId: trackRef.releaseTrackId,
      legacyTrackId: trackRef.legacyTrackId,
      releaseId: params.releaseId,
      creatorProfileId: params.creatorProfileId,
      status: 'queued',
      stage: 'queued',
      motionPreset: params.motionPreset ?? 'ambient',
      provider: VIDEO_PROVIDER,
      model: VIDEO_MODEL,
      durationSec: CANVAS_DEFAULT_DURATION_SEC,
      loopStrategy: 'zoompan',
      metadata: {
        input: {
          artworkUrl: params.artworkUrl,
          releaseTitle: params.releaseTitle,
          artistName: params.artistName,
        },
      },
      createdAt: now,
    })
    .returning();

  await upsertTrackCanvasState({
    trackRef,
    releaseId: params.releaseId,
    creatorProfileId: params.creatorProfileId,
    status: 'queued',
    lastGeneratedAt: now,
  });
  await syncReleaseCanvasMetadata(params.releaseId);

  return mapGenerationRecord(generation, []);
}

export async function processCanvasGeneration(
  generationId: string
): Promise<CanvasGenerationResult> {
  const generation = await getGenerationRow(generationId);
  if (!generation) {
    throw new Error('Canvas generation not found');
  }

  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      artworkUrl: discogReleases.artworkUrl,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(eq(discogReleases.id, generation.releaseId))
    .limit(1);

  if (!release?.artworkUrl) {
    throw new Error('Release artwork is missing');
  }

  const trackRef: TrackReference = {
    releaseTrackId: generation.releaseTrackId,
    legacyTrackId: generation.legacyTrackId,
  };
  const trackId = generation.releaseTrackId ?? generation.legacyTrackId ?? '';
  const startedAt = new Date();

  await updateGeneration({
    generationId,
    status: 'processing',
    stage: 'preparing_image',
    startedAt,
    failureCode: null,
    failureMessage: null,
  });
  await upsertTrackCanvasState({
    trackRef,
    releaseId: generation.releaseId,
    creatorProfileId: generation.creatorProfileId,
    status: 'processing',
    lastGeneratedAt: startedAt,
    lastError: null,
  });
  await syncReleaseCanvasMetadata(generation.releaseId);

  try {
    const imageMaster = await ensureImageMaster({
      creatorProfileId: generation.creatorProfileId,
      releaseId: generation.releaseId,
      artworkUrl: release.artworkUrl,
    });

    await updateGeneration({
      generationId,
      stage: 'generating_video',
      imageMasterId: imageMaster.id,
    });

    const processedImage = (
      await readCanvasArtifact({
        storagePath: imageMaster.processedImagePath,
      })
    ).body;
    const rendered = await renderCanvasVideos({ processedImage });

    await updateGeneration({
      generationId,
      stage: 'encoding',
      qc: {
        source: imageMaster.qc,
      },
    });

    await updateGeneration({
      generationId,
      stage: 'validating',
    });

    const qc = {
      durationSec: rendered.masterProbe.durationSec,
      width: rendered.masterProbe.width,
      height: rendered.masterProbe.height,
      passesSpec:
        rendered.masterProbe.durationSec >=
          SPOTIFY_CANVAS_SPEC.minDurationSec &&
        rendered.masterProbe.durationSec <=
          SPOTIFY_CANVAS_SPEC.maxDurationSec &&
        rendered.masterProbe.width >= SPOTIFY_CANVAS_SPEC.minWidth &&
        rendered.masterProbe.height >= SPOTIFY_CANVAS_SPEC.minHeight,
    };

    if (!qc.passesSpec) {
      throw new Error('Generated video failed Spotify Canvas validation');
    }

    const artifacts = await createArtifactsForGeneration({
      generationId,
      creatorProfileId: generation.creatorProfileId,
      trackId,
      masterVideo: rendered.masterVideo,
      uploadVideo: rendered.uploadVideo,
      posterJpg: rendered.posterJpg,
      processedImagePath: imageMaster.processedImagePath,
      width: rendered.masterProbe.width,
      height: rendered.masterProbe.height,
      durationSec: rendered.masterProbe.durationSec,
      manifest: {
        generationId,
        releaseId: generation.releaseId,
        trackId,
        provider: VIDEO_PROVIDER,
        model: VIDEO_MODEL,
        imageMasterId: imageMaster.id,
        qc,
      },
    });

    const completedAt = new Date();
    await updateGeneration({
      generationId,
      status: 'ready',
      stage: 'completed',
      completedAt,
      qc,
    });
    await upsertTrackCanvasState({
      trackRef,
      releaseId: generation.releaseId,
      creatorProfileId: generation.creatorProfileId,
      status: 'ready',
      currentGenerationId: generationId,
      lastGeneratedAt: completedAt,
      lastError: null,
    });
    await syncReleaseCanvasMetadata(generation.releaseId);

    const uploadArtifact = artifacts.find(
      artifact => artifact.kind === 'upload_video'
    );

    return {
      success: true,
      generationId,
      status: 'ready',
      stage: 'completed',
      artifact: uploadArtifact ? mapArtifactRecord(uploadArtifact) : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Canvas generation failed';
    captureCanvasError(error, generationId);

    await updateGeneration({
      generationId,
      status: 'failed',
      stage: 'failed',
      failureCode: 'generation_failed',
      failureMessage: message,
      completedAt: new Date(),
    });

    const [existingState] = await db
      .select()
      .from(trackCanvasState)
      .where(buildTrackStateClause(trackRef))
      .limit(1);

    const nextStatus =
      existingState?.uploadedGenerationId || existingState?.currentGenerationId
        ? normalizeTrackCanvasStatus(existingState.status)
        : 'failed';

    await upsertTrackCanvasState({
      trackRef,
      releaseId: generation.releaseId,
      creatorProfileId: generation.creatorProfileId,
      status: nextStatus,
      currentGenerationId: existingState?.currentGenerationId ?? null,
      uploadedGenerationId: existingState?.uploadedGenerationId ?? null,
      lastGeneratedAt: existingState?.lastGeneratedAt ?? null,
      lastError: message,
    });
    await syncReleaseCanvasMetadata(generation.releaseId);

    return {
      success: false,
      generationId,
      status: 'failed',
      stage: 'failed',
      error: message,
    };
  }
}

function captureCanvasError(error: unknown, generationId: string): void {
  Sentry.captureException(error, {
    tags: {
      feature: 'spotify-canvas',
      generationId,
    },
  });
  logger.error('[Canvas] Generation failed', { generationId, error });
}

function shouldReturnEmptyCanvasSummaryMap(error: unknown): boolean {
  if (
    Boolean(process.env.VITEST) &&
    error instanceof Error &&
    error.message.includes('DATABASE_URL environment variable is not set')
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '42P01'
  ) {
    return true;
  }

  return (
    error.message.includes('relation') &&
    error.message.includes('does not exist')
  );
}

export async function listTrackCanvasSummariesForRelease(
  releaseId: string
): Promise<Map<string, TrackCanvasSummary>> {
  let states;
  let generationCounts;
  let downloadable;

  try {
    [states, generationCounts, downloadable] = await Promise.all([
      db
        .select()
        .from(trackCanvasState)
        .where(eq(trackCanvasState.releaseId, releaseId)),
      db
        .select({
          releaseTrackId: canvasGenerations.releaseTrackId,
          legacyTrackId: canvasGenerations.legacyTrackId,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(canvasGenerations)
        .where(eq(canvasGenerations.releaseId, releaseId))
        .groupBy(
          canvasGenerations.releaseTrackId,
          canvasGenerations.legacyTrackId
        ),
      db
        .select({
          releaseTrackId: canvasGenerations.releaseTrackId,
          legacyTrackId: canvasGenerations.legacyTrackId,
        })
        .from(canvasGenerations)
        .innerJoin(
          canvasArtifacts,
          and(
            eq(canvasArtifacts.generationId, canvasGenerations.id),
            eq(canvasArtifacts.kind, 'upload_video')
          )
        )
        .where(eq(canvasGenerations.releaseId, releaseId)),
    ]);
  } catch (error) {
    if (shouldReturnEmptyCanvasSummaryMap(error)) {
      return new Map();
    }
    throw error;
  }

  const countMap = new Map<string, number>();
  for (const row of generationCounts) {
    const key = row.releaseTrackId ?? row.legacyTrackId;
    if (key) countMap.set(key, row.count);
  }

  const downloadSet = new Set(
    downloadable
      .map(row => row.releaseTrackId ?? row.legacyTrackId)
      .filter((value): value is string => Boolean(value))
  );

  const summaryMap = new Map<string, TrackCanvasSummary>();
  for (const state of states) {
    const key = state.releaseTrackId ?? state.legacyTrackId;
    if (!key) continue;
    summaryMap.set(key, {
      status: normalizeTrackCanvasStatus(state.status),
      currentGenerationId: state.currentGenerationId ?? undefined,
      hasDownloadableAsset: downloadSet.has(key),
      versionCount: countMap.get(key) ?? 0,
      lastGeneratedAt: toIsoString(state.lastGeneratedAt),
      lastError: state.lastError ?? undefined,
    });
  }

  return summaryMap;
}

export async function getTrackCanvasHistory(params: {
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
}): Promise<TrackCanvasHistory> {
  const trackRef = toTrackReference(params.trackId, params.releaseTrackId);
  const [state, generations] = await Promise.all([
    db
      .select()
      .from(trackCanvasState)
      .where(buildTrackStateClause(trackRef))
      .limit(1),
    db
      .select()
      .from(canvasGenerations)
      .where(
        and(
          eq(canvasGenerations.releaseId, params.releaseId),
          buildTrackReferenceClause(trackRef)
        )
      )
      .orderBy(desc(canvasGenerations.createdAt)),
  ]);

  const artifactMap = await loadGenerationsWithArtifacts(
    generations.map(generation => generation.id)
  );

  return {
    trackId: params.trackId,
    releaseTrackId: params.releaseTrackId,
    status: normalizeTrackCanvasStatus(state[0]?.status),
    currentGenerationId: state[0]?.currentGenerationId ?? undefined,
    uploadedGenerationId: state[0]?.uploadedGenerationId ?? undefined,
    lastGeneratedAt: toIsoString(state[0]?.lastGeneratedAt),
    lastError: state[0]?.lastError ?? undefined,
    generations: generations.map(generation =>
      mapGenerationRecord(generation, artifactMap.get(generation.id) ?? [])
    ),
  };
}

export async function selectTrackCanvasGeneration(params: {
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly generationId: string;
}): Promise<TrackCanvasHistory> {
  const trackRef = toTrackReference(params.trackId, params.releaseTrackId);
  const [generation] = await db
    .select()
    .from(canvasGenerations)
    .where(
      and(
        eq(canvasGenerations.id, params.generationId),
        eq(canvasGenerations.releaseId, params.releaseId),
        buildTrackReferenceClause(trackRef)
      )
    )
    .limit(1);

  if (!generation || generation.status === 'failed') {
    throw new Error('Canvas generation not found');
  }

  const [state] = await db
    .select()
    .from(trackCanvasState)
    .where(buildTrackStateClause(trackRef))
    .limit(1);

  await upsertTrackCanvasState({
    trackRef,
    releaseId: params.releaseId,
    creatorProfileId: generation.creatorProfileId,
    status:
      state?.uploadedGenerationId === generation.id ? 'uploaded' : 'ready',
    currentGenerationId: generation.id,
    uploadedGenerationId: state?.uploadedGenerationId ?? null,
    lastGeneratedAt: generation.completedAt ?? generation.createdAt,
    lastError: null,
  });
  await syncReleaseCanvasMetadata(params.releaseId);

  return getTrackCanvasHistory(params);
}

export async function markTrackCanvasUploaded(params: {
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly generationId: string;
}): Promise<TrackCanvasHistory> {
  const trackRef = toTrackReference(params.trackId, params.releaseTrackId);
  const [generation] = await db
    .select()
    .from(canvasGenerations)
    .where(
      and(
        eq(canvasGenerations.id, params.generationId),
        eq(canvasGenerations.releaseId, params.releaseId),
        buildTrackReferenceClause(trackRef)
      )
    )
    .limit(1);

  if (!generation) {
    throw new Error('Canvas generation not found');
  }

  await db
    .update(canvasGenerations)
    .set({ status: 'uploaded' })
    .where(eq(canvasGenerations.id, params.generationId));

  await upsertTrackCanvasState({
    trackRef,
    releaseId: params.releaseId,
    creatorProfileId: generation.creatorProfileId,
    status: 'uploaded',
    currentGenerationId: params.generationId,
    uploadedGenerationId: params.generationId,
    lastGeneratedAt: generation.completedAt ?? generation.createdAt,
    lastError: null,
  });
  await syncReleaseCanvasMetadata(params.releaseId);

  return getTrackCanvasHistory(params);
}

export async function getCanvasGeneration(params: {
  readonly generationId: string;
}): Promise<CanvasGenerationRecord | null> {
  const generation = await getGenerationRow(params.generationId);
  if (!generation) {
    return null;
  }

  const artifactMap = await loadGenerationsWithArtifacts([generation.id]);
  return mapGenerationRecord(generation, artifactMap.get(generation.id) ?? []);
}

export async function getCanvasDownloadArtifact(params: {
  readonly releaseId: string;
  readonly trackId: string;
  readonly releaseTrackId?: string;
  readonly generationId: string;
}): Promise<CanvasArtifactRecord> {
  const trackRef = toTrackReference(params.trackId, params.releaseTrackId);
  const [artifact] = await db
    .select({
      id: canvasArtifacts.id,
      generationId: canvasArtifacts.generationId,
      kind: canvasArtifacts.kind,
      storagePath: canvasArtifacts.storagePath,
      mimeType: canvasArtifacts.mimeType,
      width: canvasArtifacts.width,
      height: canvasArtifacts.height,
      durationSec: canvasArtifacts.durationSec,
      fileSizeBytes: canvasArtifacts.fileSizeBytes,
      createdAt: canvasArtifacts.createdAt,
    })
    .from(canvasArtifacts)
    .innerJoin(
      canvasGenerations,
      eq(canvasGenerations.id, canvasArtifacts.generationId)
    )
    .where(
      and(
        eq(canvasArtifacts.kind, 'upload_video'),
        eq(canvasGenerations.id, params.generationId),
        eq(canvasGenerations.releaseId, params.releaseId),
        buildTrackReferenceClause(trackRef)
      )
    )
    .limit(1);

  if (!artifact) {
    throw new Error('Canvas artifact not found');
  }

  return mapArtifactRecord(artifact as ArtifactRow);
}

export async function createBulkCanvasGenerations(params: {
  readonly creatorProfileId: string;
  readonly releaseId: string;
  readonly tracks: ReadonlyArray<{
    readonly id: string;
    readonly releaseTrackId?: string;
  }>;
  readonly artworkUrl: string;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly motionPreset?: CanvasMotionPreset;
}): Promise<readonly CanvasGenerationRecord[]> {
  const results: CanvasGenerationRecord[] = [];

  for (const track of params.tracks) {
    results.push(
      await createCanvasGeneration({
        creatorProfileId: params.creatorProfileId,
        releaseId: params.releaseId,
        trackId: track.id,
        releaseTrackId: track.releaseTrackId,
        artworkUrl: params.artworkUrl,
        releaseTitle: params.releaseTitle,
        artistName: params.artistName,
        motionPreset: params.motionPreset,
      })
    );
  }

  return results;
}

export async function getOwnedReleaseCanvasContext(params: {
  readonly creatorProfileId: string;
  readonly releaseId: string;
}): Promise<{
  readonly releaseId: string;
  readonly title: string;
  readonly artworkUrl: string | null;
}> {
  const [release] = await db
    .select({
      releaseId: discogReleases.id,
      title: discogReleases.title,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, params.releaseId),
        eq(discogReleases.creatorProfileId, params.creatorProfileId)
      )
    )
    .limit(1);

  if (!release) {
    throw new Error('Release not found');
  }

  return release;
}

export async function resolveOwnedTrackCanvasContext(params: {
  readonly creatorProfileId: string;
  readonly trackId: string;
}): Promise<{
  readonly releaseId: string;
  readonly releaseTrackId?: string;
  readonly trackId: string;
}> {
  const [releaseTrack] = await db
    .select({
      trackId: discogReleaseTracks.id,
      releaseId: discogReleaseTracks.releaseId,
    })
    .from(discogReleaseTracks)
    .innerJoin(
      discogReleases,
      eq(discogReleases.id, discogReleaseTracks.releaseId)
    )
    .where(
      and(
        eq(discogReleaseTracks.id, params.trackId),
        eq(discogReleases.creatorProfileId, params.creatorProfileId)
      )
    )
    .limit(1);

  if (releaseTrack) {
    return {
      releaseId: releaseTrack.releaseId,
      releaseTrackId: releaseTrack.trackId,
      trackId: releaseTrack.trackId,
    };
  }

  const [legacyTrack] = await db
    .select({
      trackId: discogTracks.id,
      releaseId: discogTracks.releaseId,
    })
    .from(discogTracks)
    .innerJoin(discogReleases, eq(discogReleases.id, discogTracks.releaseId))
    .where(
      and(
        eq(discogTracks.id, params.trackId),
        eq(discogReleases.creatorProfileId, params.creatorProfileId)
      )
    )
    .limit(1);

  if (!legacyTrack) {
    throw new Error('Track not found');
  }

  return {
    releaseId: legacyTrack.releaseId,
    trackId: legacyTrack.trackId,
  };
}

export type { CanvasStyle, CanvasVideoSpec };
export { SPOTIFY_CANVAS_SPEC };
