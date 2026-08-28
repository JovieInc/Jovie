/**
 * Thumbnail experiment winners (JOV-5362).
 *
 * Winners are derived from locked metrics and explicitly promoted. Version
 * history stays append-only; promotion never rewrites imageUrl/provenance.
 */

export type ThumbnailExperimentStatus =
  | 'measuring'
  | 'locked'
  | 'promoted'
  | 'abandoned';

export interface ThumbnailExperimentCandidate {
  readonly versionId: string;
  readonly imageUrl: string;
  readonly impressions: number | null;
  readonly ctr: number | null;
  readonly views: number | null;
}

export interface ThumbnailExperimentWindow {
  readonly start: Date;
  readonly end: Date;
  readonly locked: boolean;
}

export interface ThumbnailExperimentState {
  readonly experimentId: string;
  readonly videoPk: string;
  readonly status: ThumbnailExperimentStatus;
  readonly window: ThumbnailExperimentWindow;
  readonly candidates: readonly ThumbnailExperimentCandidate[];
  readonly winnerVersionId: string | null;
  readonly winnerRationale: string | null;
  readonly promotedAt: Date | null;
  readonly promotedBy: string | null;
}

export interface ThumbnailPromotion {
  readonly experimentId: string;
  readonly winnerVersionId: string;
  readonly previousCurrentVersionId: string | null;
  readonly promotedAt: Date;
  readonly promotedBy: string;
  readonly rationale: string;
}

export function deriveThumbnailExperimentWinner(input: {
  readonly experimentId: string;
  readonly videoPk: string;
  readonly window: ThumbnailExperimentWindow;
  readonly candidates: readonly ThumbnailExperimentCandidate[];
  readonly now: Date;
}): ThumbnailExperimentState {
  const base = {
    experimentId: input.experimentId,
    videoPk: input.videoPk,
    window: input.window,
    candidates: input.candidates,
    promotedAt: null,
    promotedBy: null,
  };

  if (!input.window.locked || input.now < input.window.end) {
    return {
      ...base,
      status: 'measuring',
      winnerVersionId: null,
      winnerRationale: null,
    };
  }

  const measurable = input.candidates.filter(
    candidate =>
      candidate.ctr !== null &&
      candidate.impressions !== null &&
      candidate.impressions > 0
  );
  if (measurable.length === 0) {
    return {
      ...base,
      status: 'measuring',
      winnerVersionId: null,
      winnerRationale:
        'Measurement window ended without locked CTR/impressions; no winner.',
    };
  }

  const ranked = [...measurable].sort((left, right) => {
    const ctrDelta = (right.ctr ?? 0) - (left.ctr ?? 0);
    if (ctrDelta !== 0) return ctrDelta;
    return (right.impressions ?? 0) - (left.impressions ?? 0);
  });
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const rationale = runnerUp
    ? `Locked window ${input.window.start.toISOString()}–${input.window.end.toISOString()} selected ${winner.versionId} at CTR ${(winner.ctr ?? 0).toFixed(4)} over ${runnerUp.versionId} at ${(runnerUp.ctr ?? 0).toFixed(4)}.`
    : `Locked window ${input.window.start.toISOString()}–${input.window.end.toISOString()} selected ${winner.versionId} as the only candidate with CTR ${(winner.ctr ?? 0).toFixed(4)}.`;

  return {
    ...base,
    status: 'locked',
    winnerVersionId: winner.versionId,
    winnerRationale: rationale,
  };
}

export function promoteThumbnailWinner(input: {
  readonly experiment: ThumbnailExperimentState;
  readonly currentVersionId: string | null;
  readonly promotedBy: string;
  readonly promotedAt: Date;
}): ThumbnailPromotion {
  if (
    input.experiment.status !== 'locked' ||
    !input.experiment.winnerVersionId
  ) {
    throw new Error(
      'Thumbnail winners must be derived from a locked experiment before promotion'
    );
  }
  if (!input.promotedBy.trim()) {
    throw new Error('Thumbnail promotion requires an explicit actor');
  }
  return {
    experimentId: input.experiment.experimentId,
    winnerVersionId: input.experiment.winnerVersionId,
    previousCurrentVersionId:
      input.currentVersionId &&
      input.currentVersionId !== input.experiment.winnerVersionId
        ? input.currentVersionId
        : null,
    promotedAt: input.promotedAt,
    promotedBy: input.promotedBy,
    rationale:
      input.experiment.winnerRationale ??
      `Explicitly promoted ${input.experiment.winnerVersionId}.`,
  };
}
