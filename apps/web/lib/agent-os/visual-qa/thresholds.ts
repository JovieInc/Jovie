export interface VisualQaWeightedRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly weight: number;
}

export interface VisualQaDiffThreshold {
  readonly surfaceId: string;
  readonly maxWeightedDriftScore: number;
  readonly regions?: readonly VisualQaWeightedRegion[];
}

/**
 * Per-surface drift thresholds for the Visual QA proposal-validation pipeline.
 * Scores are weighted drift ratios in the 0-1 range.
 */
export const VISUAL_QA_DIFF_THRESHOLDS = [
  {
    surfaceId: 'shell-desktop-idle',
    maxWeightedDriftScore: 0.08,
    regions: [
      {
        id: 'shell-chrome',
        x: 0,
        y: 0,
        width: 1,
        height: 0.18,
        weight: 1.5,
      },
    ],
  },
  {
    surfaceId: 'list-releases-default',
    maxWeightedDriftScore: 0.1,
    regions: [
      {
        id: 'table-body',
        x: 0,
        y: 0.22,
        width: 1,
        height: 0.78,
        weight: 1.25,
      },
    ],
  },
  {
    surfaceId: 'drawer-release-open',
    maxWeightedDriftScore: 0.1,
    regions: [
      {
        id: 'drawer-panel',
        x: 0.58,
        y: 0,
        width: 0.42,
        height: 1,
        weight: 1.5,
      },
    ],
  },
  {
    surfaceId: 'settings-root-hierarchy',
    maxWeightedDriftScore: 0.09,
  },
] as const satisfies readonly VisualQaDiffThreshold[];

export const DEFAULT_VISUAL_QA_DIFF_THRESHOLD = 0.12;

export function getVisualQaDiffThreshold(
  surfaceId: string
): VisualQaDiffThreshold {
  const configured = VISUAL_QA_DIFF_THRESHOLDS.find(
    threshold => threshold.surfaceId === surfaceId
  );

  if (configured) {
    return configured;
  }

  return {
    surfaceId,
    maxWeightedDriftScore: DEFAULT_VISUAL_QA_DIFF_THRESHOLD,
  };
}
