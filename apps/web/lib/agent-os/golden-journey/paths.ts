import path from 'node:path';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';
import { assertValidGoldenJourneyRouteId } from './routes';

export const GOLDEN_JOURNEY_RUNS_ROOT_SEGMENTS = [
  'agentos',
  'runs',
  'golden-journey',
] as const;

export const GOLDEN_JOURNEY_GOLDENS_ROOT_SEGMENTS = [
  'agentos',
  'golden-journey-goldens',
] as const;

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export function getGoldenJourneyRunsRootDirectory(): string {
  return (
    process.env.GOLDEN_JOURNEY_RUNS_DIR ??
    resolveMonorepoPath(...GOLDEN_JOURNEY_RUNS_ROOT_SEGMENTS)
  );
}

/**
 * Rolling baseline directory. Populated by the previous accepted sweep
 * (restored from the workflow cache in CI); when a route has no golden yet
 * the current capture bootstraps it.
 */
export function getGoldenJourneyGoldensDirectory(): string {
  return (
    process.env.GOLDEN_JOURNEY_GOLDENS_DIR ??
    resolveMonorepoPath(...GOLDEN_JOURNEY_GOLDENS_ROOT_SEGMENTS)
  );
}

export function assertValidGoldenJourneyRunId(runId: string): string {
  const safeRunId = runId.trim();
  if (!RUN_ID_PATTERN.test(safeRunId)) {
    throw new Error(`Invalid golden journey run id: ${runId}`);
  }

  return safeRunId;
}

export function resolveGoldenJourneyRunDirectory(runId: string): string {
  const safeRunId = assertValidGoldenJourneyRunId(runId);
  return validatePathTraversal(safeRunId, getGoldenJourneyRunsRootDirectory());
}

export function resolveGoldenJourneyScreenshotPath(
  runId: string,
  routeId: string
): string {
  const safeRunId = assertValidGoldenJourneyRunId(runId);
  const safeRouteId = assertValidGoldenJourneyRouteId(routeId);
  return validatePathTraversal(
    path.join(safeRunId, `${safeRouteId}.png`),
    getGoldenJourneyRunsRootDirectory()
  );
}

export function resolveGoldenJourneyDiffOverlayPath(
  runId: string,
  routeId: string
): string {
  const safeRunId = assertValidGoldenJourneyRunId(runId);
  const safeRouteId = assertValidGoldenJourneyRouteId(routeId);
  return validatePathTraversal(
    path.join(safeRunId, `${safeRouteId}.diff.png`),
    getGoldenJourneyRunsRootDirectory()
  );
}

export function resolveGoldenJourneyManifestPath(runId: string): string {
  const safeRunId = assertValidGoldenJourneyRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'manifest.json'),
    getGoldenJourneyRunsRootDirectory()
  );
}

export function resolveGoldenJourneyIssueFilingsPath(runId: string): string {
  const safeRunId = assertValidGoldenJourneyRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'issue-filings.json'),
    getGoldenJourneyRunsRootDirectory()
  );
}

export function resolveGoldenJourneyGoldenPath(routeId: string): string {
  const safeRouteId = assertValidGoldenJourneyRouteId(routeId);
  return validatePathTraversal(
    `${safeRouteId}.png`,
    getGoldenJourneyGoldensDirectory()
  );
}
