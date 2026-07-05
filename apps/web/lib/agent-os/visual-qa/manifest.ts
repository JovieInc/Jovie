import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  resolveVisualQaManifestPath,
  resolveVisualQaRunDirectory,
  toVisualQaRelativePath,
} from '@/lib/agent-os/visual-qa/paths';
import { getVisualQaSurface } from '@/lib/visual-qa/registry';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';
import {
  isVisualQaRunManifest,
  type VisualQaPhase,
  type VisualQaPhaseCaptureRecord,
  type VisualQaRunManifest,
  type VisualQaSurfaceCaptureRecord,
} from '@/lib/visual-qa/types';
import { VISUAL_QA_VIEWPORTS } from '@/lib/visual-qa/viewports';

interface RecordVisualQaCaptureInput {
  readonly runId: string;
  readonly surfaceId: string;
  readonly phase: VisualQaPhase;
  readonly colorScheme: VisualQaColorScheme;
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

function createThemeCaptureRecord(
  surfaceId: string,
  colorScheme: VisualQaColorScheme
): VisualQaPhaseCaptureRecord {
  return {
    baselinePath: `${surfaceId}/baseline-${colorScheme}.png`,
    afterPath: `${surfaceId}/after-${colorScheme}.png`,
    baselineCapturedAt: null,
    afterCapturedAt: null,
  };
}

function createSurfaceRecord(surfaceId: string): VisualQaSurfaceCaptureRecord {
  const surface = getVisualQaSurface(surfaceId);
  if (!surface) {
    throw new Error(`Unknown Visual QA surface: ${surfaceId}`);
  }

  const viewport = VISUAL_QA_VIEWPORTS[surface.baseline.viewport];
  const themes = (surface.themes ?? ['dark', 'light']).reduce<
    Partial<Record<VisualQaColorScheme, VisualQaPhaseCaptureRecord>>
  >((accumulator, colorScheme) => {
    accumulator[colorScheme] = createThemeCaptureRecord(
      surface.id,
      colorScheme
    );
    return accumulator;
  }, {});

  return {
    surfaceId: surface.id,
    title: surface.title,
    viewport,
    themes,
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

  const existingThemeRecord =
    nextSurfaceRecord.themes[input.colorScheme] ??
    createThemeCaptureRecord(input.surfaceId, input.colorScheme);

  const updatedThemeRecord: VisualQaPhaseCaptureRecord = {
    ...existingThemeRecord,
    baselineCapturedAt:
      input.phase === 'baseline'
        ? capturedAt
        : existingThemeRecord.baselineCapturedAt,
    afterCapturedAt:
      input.phase === 'after'
        ? capturedAt
        : existingThemeRecord.afterCapturedAt,
    baselinePath:
      input.phase === 'baseline'
        ? relativeScreenshotPath
        : existingThemeRecord.baselinePath,
    afterPath:
      input.phase === 'after'
        ? relativeScreenshotPath
        : existingThemeRecord.afterPath,
  };

  const updatedSurfaceRecord: VisualQaSurfaceCaptureRecord = {
    ...nextSurfaceRecord,
    themes: {
      ...nextSurfaceRecord.themes,
      [input.colorScheme]: updatedThemeRecord,
    },
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
