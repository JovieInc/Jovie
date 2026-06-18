import path from 'node:path';
import { assertValidAgentOsRunId } from '@/lib/agent-os/run-id';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';

export const DESIGN_TASTE_JURY_ROOT_SEGMENTS = [
  'agentos',
  'runs',
  'design-taste-jury',
] as const;

export function getDesignTasteJuryRootDirectory(): string {
  return resolveMonorepoPath(...DESIGN_TASTE_JURY_ROOT_SEGMENTS);
}

export function assertValidDesignTasteJuryRunId(runId: string): string {
  return assertValidAgentOsRunId(runId, 'design taste jury run id');
}

export function resolveDesignTasteJuryRunDirectory(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(safeRunId, getDesignTasteJuryRootDirectory());
}

export function resolveDesignTasteJuryResultPath(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'loop-result.json'),
    getDesignTasteJuryRootDirectory()
  );
}

export function resolveDesignTasteJuryCapturePlanPath(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'capture-plan.json'),
    getDesignTasteJuryRootDirectory()
  );
}

export function resolveDesignTasteJuryConsensusPath(runId: string): string {
  const safeRunId = assertValidDesignTasteJuryRunId(runId);
  return validatePathTraversal(
    path.join(safeRunId, 'consensus.json'),
    getDesignTasteJuryRootDirectory()
  );
}
