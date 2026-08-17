import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getVisualQaCoverageForCaptureSurface,
  type VisualQaCoverageEntry,
} from '@/lib/agent-os/visual-qa/coverage';
import { hashVisualQaLockedRegions } from '@/lib/agent-os/visual-qa/locked-regions';
import {
  resolveVisualQaManifestPath,
  resolveVisualQaRunDirectory,
} from '@/lib/agent-os/visual-qa/paths';
import { getVisualQaSurface } from '@/lib/visual-qa/registry';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';
import {
  isVisualQaRunManifest,
  type VisualQaPhase,
  type VisualQaPhaseCaptureRecord,
  type VisualQaRunManifest,
  type VisualQaSurfaceCaptureRecord,
  type VisualQaViewportSize,
} from '@/lib/visual-qa/types';
import { VISUAL_QA_VIEWPORTS } from '@/lib/visual-qa/viewports';

interface RecordVisualQaCaptureInput {
  readonly runId: string;
  readonly surfaceId: string;
  readonly phase: VisualQaPhase;
  readonly colorScheme: VisualQaColorScheme;
  readonly screenshotPath: string;
  readonly gitSha?: string | null;
  readonly coverageId?: string;
  readonly surfaceDefinition?: {
    readonly title: string;
    readonly viewport: VisualQaViewportSize;
  };
}

function toVisualQaRunRelativePath(
  runDirectory: string,
  screenshotPath: string
): string {
  const relativePath = path.relative(runDirectory, screenshotPath);
  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Visual QA screenshot must be inside its run directory: ${screenshotPath}`
    );
  }

  return relativePath;
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

function createSurfaceRecord(
  surfaceId: string,
  surfaceDefinition?: RecordVisualQaCaptureInput['surfaceDefinition']
): VisualQaSurfaceCaptureRecord {
  const surface = getVisualQaSurface(surfaceId);
  if (!surface && !surfaceDefinition) {
    throw new Error(`Unknown Visual QA surface: ${surfaceId}`);
  }

  const viewport = surface
    ? VISUAL_QA_VIEWPORTS[surface.baseline.viewport]
    : surfaceDefinition?.viewport;
  const title = surface?.title ?? surfaceDefinition?.title;
  if (!viewport || !title) {
    throw new Error(
      `Visual QA surface ${surfaceId} is missing capture metadata.`
    );
  }

  const themes = (surface?.themes ?? ['dark', 'light']).reduce<
    Partial<Record<VisualQaColorScheme, VisualQaPhaseCaptureRecord>>
  >((accumulator, colorScheme) => {
    accumulator[colorScheme] = createThemeCaptureRecord(surfaceId, colorScheme);
    return accumulator;
  }, {});

  return {
    surfaceId,
    title,
    viewport,
    themes,
  };
}

function upsertSurfaceRecord(
  manifest: VisualQaRunManifest,
  surfaceId: string,
  surfaceDefinition?: RecordVisualQaCaptureInput['surfaceDefinition']
): VisualQaSurfaceCaptureRecord {
  const existing = manifest.surfaces.find(
    surface => surface.surfaceId === surfaceId
  );
  return existing ?? createSurfaceRecord(surfaceId, surfaceDefinition);
}

function resolveCoverageEntry(
  surfaceId: string,
  coverageId?: string
): VisualQaCoverageEntry | undefined {
  if (coverageId) {
    const coverage = getVisualQaCoverageForCaptureSurface(coverageId);
    if (coverage) return coverage;
  }

  return getVisualQaCoverageForCaptureSurface(surfaceId);
}

export async function recordVisualQaCapture(
  input: RecordVisualQaCaptureInput
): Promise<VisualQaRunManifest> {
  const capturedAt = new Date().toISOString();
  const runDirectory = resolveVisualQaRunDirectory(input.runId);
  await mkdir(runDirectory, { recursive: true });

  const relativeScreenshotPath = toVisualQaRunRelativePath(
    runDirectory,
    input.screenshotPath
  );
  const existingManifest = await readManifest(input.runId);
  const gitSha = input.gitSha ?? existingManifest?.gitSha ?? null;
  const coverage = resolveCoverageEntry(input.surfaceId, input.coverageId);
  const lockedRegionHashes = coverage
    ? await hashVisualQaLockedRegions(
        await readFile(input.screenshotPath),
        coverage.lockedRegions
      )
    : [];

  const nextSurfaceRecord = upsertSurfaceRecord(
    existingManifest ?? {
      runId: input.runId,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      gitSha,
      surfaces: [],
    },
    input.surfaceId,
    input.surfaceDefinition
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
    ...(coverage && coverage.lockedRegions.length > 0
      ? {
          lockedRegionHashes: {
            ...nextSurfaceRecord.lockedRegionHashes,
            [input.phase]: {
              ...nextSurfaceRecord.lockedRegionHashes?.[input.phase],
              [input.colorScheme]: lockedRegionHashes,
            },
          },
        }
      : {}),
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
