import { promises as fs } from 'node:fs';
import path from 'node:path';
import { computePixelDiff } from '@/lib/agent-os/visual-qa/pixel-diff';

/**
 * Raw diff ratio above which a route is flagged for jury review.
 * Below this, the change is treated as noise (fonts/AA jitter, timestamps).
 */
export const GOLDEN_JOURNEY_FLAG_DIFF_RATIO = 0.02;

export interface GoldenJourneyDiffOutcome {
  readonly rawDiffRatio: number;
  readonly weightedDriftScore: number;
  readonly flagged: boolean;
  readonly overlay: Buffer;
}

export async function readOptionalPng(
  filePath: string
): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function compareAgainstGolden(params: {
  readonly golden: Buffer;
  readonly current: Buffer;
  readonly flagDiffRatio?: number;
}): Promise<GoldenJourneyDiffOutcome> {
  const diff = await computePixelDiff(params.golden, params.current);
  const flagDiffRatio = params.flagDiffRatio ?? GOLDEN_JOURNEY_FLAG_DIFF_RATIO;

  return {
    rawDiffRatio: diff.rawDiffRatio,
    weightedDriftScore: diff.weightedDriftScore,
    flagged: diff.rawDiffRatio >= flagDiffRatio,
    overlay: diff.overlay,
  };
}

export async function writeGolden(
  goldenPath: string,
  current: Buffer
): Promise<void> {
  await fs.mkdir(path.dirname(goldenPath), { recursive: true });
  await fs.writeFile(goldenPath, current);
}
