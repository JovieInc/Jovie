import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  assertValidVisualQaRunId,
  getVisualQaRootDirectory,
  resolveVisualQaDiffOverlayPath,
  resolveVisualQaDiffSummaryPath,
  resolveVisualQaManifestPath,
  resolveVisualQaRunDirectory,
  resolveVisualQaRunRelativePath,
  toVisualQaRelativePath,
} from '@/lib/agent-os/visual-qa/paths';
import { computePixelDiff } from '@/lib/agent-os/visual-qa/pixel-diff';
import { getVisualQaDiffThreshold } from '@/lib/agent-os/visual-qa/thresholds';
import { validatePathTraversal } from '@/lib/security/path-traversal';

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

const DEFAULT_COMPLETED_RUN_RETENTION = 1;
const DEFAULT_FAILED_RUN_RETENTION = 3;
const MAX_RUN_RETENTION = 20;
const STALE_INCOMPLETE_RUN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface VisualQaRetentionOptions {
  readonly beforeCandidateRevalidation?: (runId: string) => Promise<void>;
  readonly retainedCompletedRuns?: number;
  readonly retainedFailedRuns?: number;
  readonly rootDirectory?: string;
}

interface ComputeVisualQaDiffOptions {
  readonly pruneCompletedRuns?: boolean;
  readonly retainedCompletedRuns?: number;
  readonly retainedFailedRuns?: number;
}

interface CompletedVisualQaRun {
  readonly runId: string;
  readonly computedAtMs: number;
  readonly passed: boolean;
}

interface VisualQaRunTreeState {
  readonly birthtimeMs: number;
  readonly containsSymlink: boolean;
  readonly dev: number;
  readonly ino: number;
  readonly newestMtimeMs: number;
}

interface InspectedVisualQaRun {
  readonly completedRun: CompletedVisualQaRun | null;
  readonly protected: boolean;
  readonly runId: string;
  readonly staleIncomplete: boolean;
  readonly treeState: VisualQaRunTreeState | null;
}

interface OwnedRootState {
  readonly dev: number;
  readonly ino: number;
}

async function inspectOwnedRoot(
  rootDirectory: string
): Promise<OwnedRootState | null> {
  const resolvedRoot = path.resolve(rootDirectory);
  const parsed = path.parse(resolvedRoot);
  const relativeParts = resolvedRoot
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  let cursor = parsed.root;

  try {
    for (const part of relativeParts) {
      cursor = path.join(cursor, part);
      const stats = await lstat(cursor);
      if (stats.isSymbolicLink() || !stats.isDirectory()) return null;
    }
    if ((await realpath(resolvedRoot)) !== resolvedRoot) return null;
    const rootStats = await lstat(resolvedRoot);
    return { dev: rootStats.dev, ino: rootStats.ino };
  } catch {
    return null;
  }
}

function resolveRunRetention(
  label: string,
  configured: number | undefined,
  defaultValue: number
): number {
  const rawValue = configured ?? defaultValue;

  if (
    !Number.isInteger(rawValue) ||
    rawValue < 1 ||
    rawValue > MAX_RUN_RETENTION
  ) {
    throw new Error(
      `${label} Visual QA run retention must be an integer between 1 and ${MAX_RUN_RETENTION}.`
    );
  }

  return rawValue;
}

async function readCompletedRun(
  rootDirectory: string,
  runId: string
): Promise<CompletedVisualQaRun | null> {
  let safeRunId: string;
  try {
    safeRunId = assertValidVisualQaRunId(runId);
  } catch {
    return null;
  }
  const runDirectory = validatePathTraversal(safeRunId, rootDirectory);

  try {
    const parsed = JSON.parse(
      await readFile(path.join(runDirectory, 'diff-summary.json'), 'utf8')
    ) as Partial<VisualQaDiffRunSummary>;
    const computedAtMs = Date.parse(parsed.computedAt ?? '');

    if (
      parsed.runId !== safeRunId ||
      typeof parsed.passed !== 'boolean' ||
      !Number.isFinite(computedAtMs)
    ) {
      return null;
    }

    return { runId: safeRunId, computedAtMs, passed: parsed.passed };
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      return null;
    }

    throw error;
  }
}

async function inspectVisualQaRunTree(
  runDirectory: string
): Promise<VisualQaRunTreeState | null> {
  try {
    const runStats = await lstat(runDirectory);
    if (runStats.isSymbolicLink()) {
      return {
        birthtimeMs: runStats.birthtimeMs,
        containsSymlink: true,
        dev: runStats.dev,
        ino: runStats.ino,
        newestMtimeMs: runStats.mtimeMs,
      };
    }
    if (runStats.isFile()) {
      return {
        birthtimeMs: runStats.birthtimeMs,
        containsSymlink: false,
        dev: runStats.dev,
        ino: runStats.ino,
        newestMtimeMs: runStats.mtimeMs,
      };
    }
    if (!runStats.isDirectory()) {
      return null;
    }

    const childStates = await Promise.all(
      (await readdir(runDirectory)).map(entryName =>
        inspectVisualQaRunTree(path.join(runDirectory, entryName))
      )
    );
    if (childStates.some(state => state === null)) {
      return null;
    }

    return childStates.reduce<VisualQaRunTreeState>(
      (state, childState) => ({
        birthtimeMs: state.birthtimeMs,
        containsSymlink:
          state.containsSymlink || childState?.containsSymlink === true,
        dev: state.dev,
        ino: state.ino,
        newestMtimeMs: Math.max(
          state.newestMtimeMs,
          childState?.newestMtimeMs ?? 0
        ),
      }),
      {
        birthtimeMs: runStats.birthtimeMs,
        containsSymlink: false,
        dev: runStats.dev,
        ino: runStats.ino,
        newestMtimeMs: runStats.mtimeMs,
      }
    );
  } catch {
    return null;
  }
}

async function inspectOwnedRunDirectory(
  rootDirectory: string,
  runId: string
): Promise<VisualQaRunTreeState | null> {
  const runDirectory = validatePathTraversal(runId, rootDirectory);
  const treeState = await inspectVisualQaRunTree(runDirectory);
  if (!treeState || treeState.containsSymlink) return null;

  try {
    const stats = await lstat(runDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return null;
    if ((await realpath(runDirectory)) !== path.resolve(runDirectory)) {
      return null;
    }
    return treeState;
  } catch {
    return null;
  }
}

function sameTreeState(
  planned: VisualQaRunTreeState,
  current: VisualQaRunTreeState
): boolean {
  return (
    planned.birthtimeMs === current.birthtimeMs &&
    planned.dev === current.dev &&
    planned.ino === current.ino &&
    planned.newestMtimeMs === current.newestMtimeMs &&
    !current.containsSymlink
  );
}

function sameCompletedRun(
  planned: CompletedVisualQaRun,
  current: CompletedVisualQaRun | null
): boolean {
  return (
    current !== null &&
    planned.runId === current.runId &&
    planned.computedAtMs === current.computedAtMs &&
    planned.passed === current.passed
  );
}

/**
 * Bound completed run history after the current run has persisted a valid summary.
 * Young incomplete runs and directory symlinks are preserved. Valid run directories
 * with missing or malformed summaries are removed only after seven days.
 */
export async function pruneCompletedVisualQaRuns(
  currentRunId: string,
  options: VisualQaRetentionOptions = {}
): Promise<readonly string[]> {
  const safeCurrentRunId = assertValidVisualQaRunId(currentRunId);
  const rootDirectory = path.resolve(
    options.rootDirectory ?? getVisualQaRootDirectory()
  );
  const ownedRoot = await inspectOwnedRoot(rootDirectory);
  if (!ownedRoot) return [];
  const retainedCompletedRuns = resolveRunRetention(
    'Completed',
    options.retainedCompletedRuns,
    DEFAULT_COMPLETED_RUN_RETENTION
  );
  const retainedFailedRuns = resolveRunRetention(
    'Failed',
    options.retainedFailedRuns,
    DEFAULT_FAILED_RUN_RETENTION
  );
  const currentTreeState = await inspectOwnedRunDirectory(
    rootDirectory,
    safeCurrentRunId
  );
  if (!currentTreeState) return [];
  const currentRun = await readCompletedRun(
    rootDirectory,
    safeCurrentRunId
  ).catch(() => null);

  if (!currentRun) {
    return [];
  }

  const entries = await readdir(rootDirectory, { withFileTypes: true }).catch(
    () => null
  );
  if (!entries) return [];
  const runEntries = entries.filter(entry => {
    if (!entry.isDirectory()) {
      return false;
    }

    try {
      assertValidVisualQaRunId(entry.name);
      return true;
    } catch {
      return false;
    }
  });
  const inspectedRuns = await Promise.all<InspectedVisualQaRun>(
    runEntries.map(async entry => {
      const treeState = await inspectOwnedRunDirectory(
        rootDirectory,
        entry.name
      );
      if (!treeState) {
        return {
          completedRun: null,
          protected: true,
          runId: entry.name,
          staleIncomplete: false,
          treeState: null,
        };
      }

      let completedRun: CompletedVisualQaRun | null;
      try {
        completedRun = await readCompletedRun(rootDirectory, entry.name);
      } catch {
        return {
          completedRun: null,
          protected: true,
          runId: entry.name,
          staleIncomplete: false,
          treeState,
        };
      }
      if (completedRun) {
        return {
          completedRun,
          protected: false,
          runId: entry.name,
          staleIncomplete: false,
          treeState,
        };
      }

      return {
        completedRun: null,
        protected: false,
        runId: entry.name,
        staleIncomplete:
          Date.now() - treeState.newestMtimeMs >
          STALE_INCOMPLETE_RUN_MAX_AGE_MS,
        treeState,
      };
    })
  );
  const sortCompletedRuns = (
    runs: readonly CompletedVisualQaRun[]
  ): CompletedVisualQaRun[] =>
    [...runs].sort(
      (left, right) =>
        right.computedAtMs - left.computedAtMs ||
        right.runId.localeCompare(left.runId)
    );
  const selectSupersededRuns = (
    runs: readonly CompletedVisualQaRun[],
    retainedRuns: number
  ): CompletedVisualQaRun[] => {
    const otherRuns = sortCompletedRuns(
      runs.filter(run => run.runId !== safeCurrentRunId)
    );
    const currentMatchesStatus = runs.some(
      run => run.runId === safeCurrentRunId
    );
    return otherRuns.slice(
      currentMatchesStatus ? Math.max(0, retainedRuns - 1) : retainedRuns
    );
  };
  const completedRuns = inspectedRuns
    .map(run => run.completedRun)
    .filter((run): run is CompletedVisualQaRun => run !== null);
  const runIdsToRemove = [
    ...selectSupersededRuns(
      completedRuns.filter(run => run.passed),
      retainedCompletedRuns
    ).map(run => run.runId),
    ...selectSupersededRuns(
      completedRuns.filter(run => !run.passed),
      retainedFailedRuns
    ).map(run => run.runId),
    ...inspectedRuns
      .filter(
        run =>
          run.runId !== safeCurrentRunId &&
          !run.protected &&
          run.completedRun === null &&
          run.staleIncomplete
      )
      .map(run => run.runId)
      .sort((left, right) => left.localeCompare(right)),
  ];
  const plannedByRunId = new Map(
    inspectedRuns.map(run => [run.runId, run] as const)
  );
  const removedRuns: string[] = [];

  for (const runId of runIdsToRemove) {
    const planned = plannedByRunId.get(runId);
    if (!planned?.treeState || runId === safeCurrentRunId) continue;
    await options.beforeCandidateRevalidation?.(runId);

    const currentRoot = await inspectOwnedRoot(rootDirectory);
    if (
      !currentRoot ||
      currentRoot.dev !== ownedRoot.dev ||
      currentRoot.ino !== ownedRoot.ino
    ) {
      break;
    }

    const revalidatedCurrentTree = await inspectOwnedRunDirectory(
      rootDirectory,
      safeCurrentRunId
    );
    const revalidatedCurrentRun = await readCompletedRun(
      rootDirectory,
      safeCurrentRunId
    ).catch(() => null);
    if (
      !revalidatedCurrentTree ||
      !sameTreeState(currentTreeState, revalidatedCurrentTree) ||
      !sameCompletedRun(currentRun, revalidatedCurrentRun)
    ) {
      break;
    }

    const revalidatedTree = await inspectOwnedRunDirectory(
      rootDirectory,
      runId
    );
    if (
      !revalidatedTree ||
      !sameTreeState(planned.treeState, revalidatedTree)
    ) {
      continue;
    }
    const revalidatedCompletedRun = await readCompletedRun(
      rootDirectory,
      runId
    ).catch(() => null);
    const stillEligible = planned.completedRun
      ? sameCompletedRun(planned.completedRun, revalidatedCompletedRun)
      : revalidatedCompletedRun === null &&
        Date.now() - revalidatedTree.newestMtimeMs >
          STALE_INCOMPLETE_RUN_MAX_AGE_MS;
    if (!stillEligible) continue;

    try {
      await rm(validatePathTraversal(runId, rootDirectory), {
        recursive: true,
      });
      removedRuns.push(runId);
    } catch {
      // Fail closed: a deletion-boundary filesystem race preserves the run.
    }
  }

  return removedRuns;
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
  runId: string,
  options: ComputeVisualQaDiffOptions = {}
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

  if (options.pruneCompletedRuns !== false) {
    await pruneCompletedVisualQaRuns(runId, {
      retainedCompletedRuns: options.retainedCompletedRuns,
      retainedFailedRuns: options.retainedFailedRuns,
    });
  }

  return summary;
}
