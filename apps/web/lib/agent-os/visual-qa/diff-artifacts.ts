import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  resolveVisualQaDiffOverlayPath,
  resolveVisualQaDiffSummaryPath,
  resolveVisualQaManifestPath,
  resolveVisualQaRunDirectory,
  resolveVisualQaRunRelativePath,
  toVisualQaRelativePath,
} from '@/lib/agent-os/visual-qa/paths';
import { computePixelDiff } from '@/lib/agent-os/visual-qa/pixel-diff';
import { getVisualQaDiffThreshold } from '@/lib/agent-os/visual-qa/thresholds';

export type VisualQaDiffStatus =
  | 'no_significant_change'
  | 'drift_detected'
  | 'missing_capture';

export interface VisualQaCaptureManifestSurface {
  readonly surfaceId: string;
  readonly title: string;
  readonly baselinePath: string;
  readonly afterPath: string;
  readonly baselineCapturedAt: string | null;
  readonly afterCapturedAt: string | null;
}

export interface VisualQaCaptureManifest {
  readonly runId: string;
  readonly surfaces: readonly VisualQaCaptureManifestSurface[];
}

export interface VisualQaSurfaceDiffRecord {
  readonly surfaceId: string;
  readonly title: string;
  readonly baselinePath: string;
  readonly afterPath: string;
  readonly overlayPath: string | null;
  readonly rawDiffRatio: number | null;
  readonly weightedDriftScore: number | null;
  readonly threshold: number;
  readonly status: VisualQaDiffStatus;
  readonly regionScores: readonly {
    readonly id: string;
    readonly diffRatio: number;
    readonly weight: number;
  }[];
}

export interface VisualQaDiffRunSummary {
  readonly runId: string;
  readonly computedAt: string;
  readonly passed: boolean;
  readonly surfaces: readonly VisualQaSurfaceDiffRecord[];
}

function isVisualQaCaptureManifest(
  value: unknown
): value is VisualQaCaptureManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const manifest = value as Partial<VisualQaCaptureManifest>;
  return (
    typeof manifest.runId === 'string' &&
    Array.isArray(manifest.surfaces) &&
    manifest.surfaces.every(surface => {
      if (!surface || typeof surface !== 'object') {
        return false;
      }

      return (
        typeof surface.surfaceId === 'string' &&
        typeof surface.title === 'string' &&
        typeof surface.baselinePath === 'string' &&
        typeof surface.afterPath === 'string'
      );
    })
  );
}

async function readCaptureManifest(
  runId: string
): Promise<VisualQaCaptureManifest> {
  const manifestPath = resolveVisualQaManifestPath(runId);
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!isVisualQaCaptureManifest(parsed) || parsed.runId !== runId) {
    throw new Error(`Invalid Visual QA capture manifest for run ${runId}.`);
  }

  return parsed;
}

async function computeSurfaceDiff(params: {
  readonly runId: string;
  readonly surface: VisualQaCaptureManifestSurface;
}): Promise<VisualQaSurfaceDiffRecord> {
  const threshold = getVisualQaDiffThreshold(params.surface.surfaceId);

  if (
    params.surface.baselineCapturedAt === null ||
    params.surface.afterCapturedAt === null
  ) {
    return {
      surfaceId: params.surface.surfaceId,
      title: params.surface.title,
      baselinePath: params.surface.baselinePath,
      afterPath: params.surface.afterPath,
      overlayPath: null,
      rawDiffRatio: null,
      weightedDriftScore: null,
      threshold: threshold.maxWeightedDriftScore,
      status: 'missing_capture',
      regionScores: [],
    };
  }

  const [baselineImage, afterImage] = await Promise.all([
    readFile(
      resolveVisualQaRunRelativePath(params.runId, params.surface.baselinePath)
    ),
    readFile(
      resolveVisualQaRunRelativePath(params.runId, params.surface.afterPath)
    ),
  ]);

  const diff = await computePixelDiff(baselineImage, afterImage, {
    regions: threshold.regions,
  });

  const overlayPath = resolveVisualQaDiffOverlayPath(
    params.runId,
    params.surface.surfaceId
  );
  await mkdir(resolveVisualQaRunDirectory(params.runId), { recursive: true });
  await writeFile(overlayPath, diff.overlay);

  const status: VisualQaDiffStatus =
    diff.weightedDriftScore <= threshold.maxWeightedDriftScore
      ? 'no_significant_change'
      : 'drift_detected';

  return {
    surfaceId: params.surface.surfaceId,
    title: params.surface.title,
    baselinePath: params.surface.baselinePath,
    afterPath: params.surface.afterPath,
    overlayPath: toVisualQaRelativePath(overlayPath),
    rawDiffRatio: diff.rawDiffRatio,
    weightedDriftScore: diff.weightedDriftScore,
    threshold: threshold.maxWeightedDriftScore,
    status,
    regionScores: diff.regionScores,
  };
}

export async function computeVisualQaDiffArtifacts(
  runId: string
): Promise<VisualQaDiffRunSummary> {
  const manifest = await readCaptureManifest(runId);
  const computedAt = new Date().toISOString();
  const surfaces = await Promise.all(
    manifest.surfaces.map(surface =>
      computeSurfaceDiff({
        runId,
        surface,
      })
    )
  );

  const summary: VisualQaDiffRunSummary = {
    runId,
    computedAt,
    passed: surfaces.every(
      surface => surface.status === 'no_significant_change'
    ),
    surfaces,
  };

  await writeFile(
    resolveVisualQaDiffSummaryPath(runId),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );

  return summary;
}
