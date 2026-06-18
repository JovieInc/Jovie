import path from 'node:path';
import { assertValidAgentOsRunId } from '@/lib/agent-os/run-id';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';
import type { VisualQaPhase } from '@/lib/visual-qa/types';

export const VISUAL_QA_ROOT_SEGMENTS = [
  'agentos',
  'runs',
  'visual-qa',
] as const;

const SURFACE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export function getVisualQaRootDirectory(): string {
  return resolveMonorepoPath(...VISUAL_QA_ROOT_SEGMENTS);
}

export function assertValidVisualQaRunId(runId: string): string {
  return assertValidAgentOsRunId(runId, 'Visual QA run id');
}

export function assertValidVisualQaSurfaceId(surfaceId: string): string {
  const safeSurfaceId = surfaceId.trim();
  if (!SURFACE_ID_PATTERN.test(safeSurfaceId)) {
    throw new Error(`Invalid Visual QA surface id: ${surfaceId}`);
  }

  return safeSurfaceId;
}

export function resolveVisualQaRunDirectory(runId: string): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  return validatePathTraversal(safeRunId, getVisualQaRootDirectory());
}

export function resolveVisualQaSurfaceDirectory(
  runId: string,
  surfaceId: string
): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  const safeSurfaceId = assertValidVisualQaSurfaceId(surfaceId);
  return validatePathTraversal(
    path.join(safeRunId, safeSurfaceId),
    getVisualQaRootDirectory()
  );
}

export function resolveVisualQaPhaseScreenshotPath(
  runId: string,
  surfaceId: string,
  phase: VisualQaPhase,
  colorScheme: VisualQaColorScheme
): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  const safeSurfaceId = assertValidVisualQaSurfaceId(surfaceId);
  return validatePathTraversal(
    path.join(safeRunId, safeSurfaceId, `${phase}-${colorScheme}.png`),
    getVisualQaRootDirectory()
  );
}

export function resolveVisualQaManifestPath(runId: string): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'manifest.json'),
    getVisualQaRootDirectory()
  );
}

export function resolveVisualQaDiffSummaryPath(runId: string): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'diff-summary.json'),
    getVisualQaRootDirectory()
  );
}

export function resolveVisualQaDiffOverlayPath(
  runId: string,
  surfaceId: string
): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  const safeSurfaceId = assertValidVisualQaSurfaceId(surfaceId);
  return validatePathTraversal(
    path.join(safeRunId, safeSurfaceId, 'diff-overlay.png'),
    getVisualQaRootDirectory()
  );
}

export function resolveVisualQaBreakpointReportPath(runId: string): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'breakpoint-report.json'),
    getVisualQaRootDirectory()
  );
}

export function resolveVisualQaRunRelativePath(
  runId: string,
  relativePath: string
): string {
  const safeRunId = assertValidVisualQaRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, relativePath),
    getVisualQaRootDirectory()
  );
}

export function toVisualQaRelativePath(absolutePath: string): string {
  const root = getVisualQaRootDirectory();
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(absolutePath);

  if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Visual QA path is outside run root: ${absolutePath}`);
  }

  return path.relative(resolvedRoot, resolvedPath);
}
