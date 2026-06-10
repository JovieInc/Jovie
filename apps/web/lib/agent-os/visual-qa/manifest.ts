import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  resolveVisualQaManifestPath,
  resolveVisualQaRunDirectory,
  toVisualQaRelativePath,
} from '@/lib/agent-os/visual-qa/paths';
import { getVisualQaSurface } from '@/lib/visual-qa/registry';
import {
  isVisualQaRunManifest,
  type VisualQaPhase,
  type VisualQaRunManifest,
  type VisualQaSurfaceCaptureRecord,
} from '@/lib/visual-qa/types';
import { VISUAL_QA_VIEWPORTS } from '@/lib/visual-qa/viewports';

interface RecordVisualQaCaptureInput {
  readonly runId: string;
  readonly surfaceId: string;
  readonly phase: VisualQaPhase;
  readonly screenshotPath: string;
  readonly gitSha?: string | null;
}

async function readManifest(
  runId: string
): Promise<VisualQaRunManifest | null> {
  const manifestPath = resolveVisualQaManifestPath(runId);

  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isVisualQaRunManifest(parsed) || parsed.runId !== runId) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function createSurfaceRecord(surfaceId: string): VisualQaSurfaceCaptureRecord {
  const surface = getVisualQaSurface(surfaceId);
  if (!surface) {
    throw new Error(`Unknown Visual QA surface: ${surfaceId}`);
  }

  const viewport = VISUAL_QA_VIEWPORTS[surface.baseline.viewport];

  return {
    surfaceId: surface.id,
    title: surface.title,
    baselinePath: `${surface.id}/baseline.png`,
    afterPath: `${surface.id}/after.png`,
    baselineCapturedAt: null,
    afterCapturedAt: null,
    viewport,
  };
}

function upsertSurfaceRecord(
  manifest: VisualQaRunManifest,
  surfaceId: string
): VisualQaSurfaceCaptureRecord {
  const existing = manifest.surfaces.find(
    surface => surface.surfaceId === surfaceId
  );
  return existing ?? createSurfaceRecord(surfaceId);
}

export async function recordVisualQaCapture(
  input: RecordVisualQaCaptureInput
): Promise<VisualQaRunManifest> {
  const capturedAt = new Date().toISOString();
  const runDirectory = resolveVisualQaRunDirectory(input.runId);
  await mkdir(runDirectory, { recursive: true });

  const relativeScreenshotPath = toVisualQaRelativePath(input.screenshotPath);
  const existingManifest = await readManifest(input.runId);
  const gitSha = input.gitSha ?? existingManifest?.gitSha ?? null;

  const nextSurfaceRecord = upsertSurfaceRecord(
    existingManifest ?? {
      runId: input.runId,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      gitSha,
      surfaces: [],
    },
    input.surfaceId
  );

  const updatedSurfaceRecord: VisualQaSurfaceCaptureRecord = {
    ...nextSurfaceRecord,
    baselineCapturedAt:
      input.phase === 'baseline'
        ? capturedAt
        : nextSurfaceRecord.baselineCapturedAt,
    afterCapturedAt:
      input.phase === 'after' ? capturedAt : nextSurfaceRecord.afterCapturedAt,
    baselinePath:
      input.phase === 'baseline'
        ? relativeScreenshotPath
        : nextSurfaceRecord.baselinePath,
    afterPath:
      input.phase === 'after'
        ? relativeScreenshotPath
        : nextSurfaceRecord.afterPath,
  };

  const remainingSurfaces =
    existingManifest?.surfaces.filter(
      surface => surface.surfaceId !== input.surfaceId
    ) ?? [];

  const nextManifest: VisualQaRunManifest = {
    runId: input.runId,
    createdAt: existingManifest?.createdAt ?? capturedAt,
    updatedAt: capturedAt,
    gitSha,
    surfaces: [...remainingSurfaces, updatedSurfaceRecord].sort((left, right) =>
      left.surfaceId.localeCompare(right.surfaceId)
    ),
  };

  await writeFile(
    resolveVisualQaManifestPath(input.runId),
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    'utf8'
  );

  return nextManifest;
}
