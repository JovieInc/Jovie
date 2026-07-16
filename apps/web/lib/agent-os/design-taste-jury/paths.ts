import path from 'node:path';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';

export const DESIGN_TASTE_JURY_ROOT_SEGMENTS = [
  'agentos',
  'runs',
  'design-taste-jury',
] as const;

export const DESIGN_TASTE_MEMORY_SEGMENTS = [
  'agentos',
  'memory',
  'design-taste.md',
] as const;

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export function getDesignTasteJuryRootDirectory(): string {
  return resolveMonorepoPath(...DESIGN_TASTE_JURY_ROOT_SEGMENTS);
}

export function getDesignTasteMemoryPath(): string {
  return resolveMonorepoPath(...DESIGN_TASTE_MEMORY_SEGMENTS);
}

export function assertValidDesignTasteJuryRunId(runId: string): string {
  const safeRunId = runId.trim();
  if (!RUN_ID_PATTERN.test(safeRunId)) {
    throw new Error(`Invalid design taste jury run id: ${runId}`);
  }

  return safeRunId;
}

export function resolveDesignTasteJuryRunDirectory(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(safeRunId, getDesignTasteJuryRootDirectory());
}

export function resolveDesignTasteJuryManifestPath(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'manifest.json'),
    getDesignTasteJuryRootDirectory()
  );
}

export function resolveDesignTasteJuryIssueFilingsPath(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'issue-filings.json'),
    getDesignTasteJuryRootDirectory()
  );
}

export function resolveDesignTasteJuryCompletionPath(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'complete.json'),
    getDesignTasteJuryRootDirectory()
  );
}
