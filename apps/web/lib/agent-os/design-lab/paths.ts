import 'server-only';

import path from 'node:path';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';

export const DESIGN_LAB_ROOT_SEGMENTS = [
  'agentos',
  'runs',
  'design-lab',
] as const;
export const DESIGN_TASTE_MEMORY_SEGMENTS = [
  'agentos',
  'memory',
  'design-taste.md',
] as const;
export const DESIGN_LAB_DISPATCH_SEGMENTS = [
  'agentos',
  'runs',
  'design-lab',
  'dispatches',
] as const;
export const DESIGN_LAB_ARTIFACT_SEGMENTS = [
  'agentos',
  'runs',
  'design-lab',
  'artifacts',
] as const;

export function getDesignLabRootDirectory(): string {
  return resolveMonorepoPath(...DESIGN_LAB_ROOT_SEGMENTS);
}

export function getDesignTasteMemoryPath(): string {
  return resolveMonorepoPath(...DESIGN_TASTE_MEMORY_SEGMENTS);
}

export function getDesignLabDispatchDirectory(): string {
  return resolveMonorepoPath(...DESIGN_LAB_DISPATCH_SEGMENTS);
}

export function getDesignLabArtifactDirectory(): string {
  return resolveMonorepoPath(...DESIGN_LAB_ARTIFACT_SEGMENTS);
}

export function resolveDesignLabArtifactRunDirectory(
  dispatchId: string
): string {
  const safeDispatchId = dispatchId.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(safeDispatchId)) {
    throw new Error(`Invalid design dispatch id: ${dispatchId}`);
  }
  return validatePathTraversal(safeDispatchId, getDesignLabArtifactDirectory());
}

export function resolveDesignProposalDayDirectory(dayBucket: string): string {
  const safeDayBucket = dayBucket.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDayBucket)) {
    throw new Error(`Invalid design proposal day bucket: ${dayBucket}`);
  }

  return validatePathTraversal(safeDayBucket, getDesignLabRootDirectory());
}

export function resolveDesignProposalFilePath(
  dayBucket: string,
  proposalId: string
): string {
  const safeDayBucket = dayBucket.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDayBucket)) {
    throw new Error(`Invalid design proposal day bucket: ${dayBucket}`);
  }

  const safeProposalId = proposalId.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(safeProposalId)) {
    throw new Error(`Invalid design proposal id: ${proposalId}`);
  }

  return validatePathTraversal(
    path.join(safeDayBucket, `${safeProposalId}.json`),
    getDesignLabRootDirectory()
  );
}

export function resolveDesignDispatchFilePath(dispatchId: string): string {
  const safeDispatchId = dispatchId.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(safeDispatchId)) {
    throw new Error(`Invalid design dispatch id: ${dispatchId}`);
  }

  return validatePathTraversal(
    `${safeDispatchId}.json`,
    getDesignLabDispatchDirectory()
  );
}
