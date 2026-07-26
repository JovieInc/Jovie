import type {
  AudioAnalysisCapability,
  AudioAnalysisFailureCode,
  AudioAnalysisProvenance,
  CanonicalMusicalKey,
} from './analysis';
import { type Bpm, bpm, type Seconds, seconds } from './units';

export interface BeatGridSegment {
  readonly startsAt: Seconds;
  readonly bpm: Bpm;
  readonly beatIndex: number;
  readonly beatsPerBar: number;
}

export interface AudioBeatGrid {
  readonly globalBpm: Bpm;
  readonly beatPositions: readonly Seconds[];
  readonly downbeatPositions: readonly Seconds[];
  readonly segments: readonly BeatGridSegment[];
}

export interface AudioBeatGridInput {
  readonly globalBpm: number;
  readonly beatPositions: readonly number[];
  readonly downbeatPositions: readonly number[];
  readonly segments: readonly {
    readonly startsAt: number;
    readonly bpm: number;
    readonly beatIndex: number;
    readonly beatsPerBar: number;
  }[];
}

function requireStrictlyIncreasing(
  values: readonly number[],
  field: string
): void {
  if (values.slice(1).some((value, index) => value <= values[index])) {
    throw new RangeError(`${field} must be strictly increasing`);
  }
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }
  return value;
}

export function createAudioBeatGrid(input: AudioBeatGridInput): AudioBeatGrid {
  if (input.beatPositions.length === 0) {
    throw new RangeError('beat positions must not be empty');
  }
  requireStrictlyIncreasing(input.beatPositions, 'beat positions');
  requireStrictlyIncreasing(input.downbeatPositions, 'downbeat positions');

  const beatPositionSet = new Set(input.beatPositions);
  if (
    input.downbeatPositions.some(position => !beatPositionSet.has(position))
  ) {
    throw new RangeError('downbeat positions must reference detected beats');
  }

  let previousBeatIndex = -1;
  const segments = input.segments.map(segment => {
    const beatIndex = requireNonNegativeInteger(
      segment.beatIndex,
      'segment beat index'
    );
    if (
      beatIndex >= input.beatPositions.length ||
      beatIndex <= previousBeatIndex
    ) {
      throw new RangeError('segment beat indexes must be unique and ordered');
    }
    if (segment.startsAt !== input.beatPositions[beatIndex]) {
      throw new RangeError('segment start must match its detected beat');
    }
    if (
      !Number.isInteger(segment.beatsPerBar) ||
      segment.beatsPerBar < 1 ||
      segment.beatsPerBar > 32
    ) {
      throw new RangeError(
        'segment beats per bar must be an integer from 1 to 32'
      );
    }
    previousBeatIndex = beatIndex;
    return {
      startsAt: seconds(segment.startsAt),
      bpm: bpm(segment.bpm),
      beatIndex,
      beatsPerBar: segment.beatsPerBar,
    };
  });

  return {
    globalBpm: bpm(input.globalBpm),
    beatPositions: input.beatPositions.map(seconds),
    downbeatPositions: input.downbeatPositions.map(seconds),
    segments,
  };
}

export interface AudioAnalysisResult {
  readonly provenance: AudioAnalysisProvenance;
  readonly tempo: Bpm | null;
  readonly beatGrid: AudioBeatGrid | null;
  readonly musicalKey: CanonicalMusicalKey | null;
}

export type AudioAnalysisOutcome =
  | {
      readonly status: 'unknown';
      readonly reason: 'not_requested' | 'not_available';
    }
  | {
      readonly status: 'partial';
      readonly result: AudioAnalysisResult;
      readonly missingCapabilities: readonly AudioAnalysisCapability[];
    }
  | { readonly status: 'complete'; readonly result: AudioAnalysisResult }
  | {
      readonly status: 'failed';
      readonly failure: {
        readonly code: AudioAnalysisFailureCode;
        readonly retryable: boolean;
      };
    };

export type BeatGridOrigin = 'analysis' | 'user';

export interface BeatGridRevision {
  readonly origin: BeatGridOrigin;
  readonly revision: number;
  readonly grid: AudioBeatGrid;
}

export type BeatGridAdoptionDecision =
  | { readonly action: 'adopt'; readonly nextRevision: number }
  | { readonly action: 'replace_analysis'; readonly nextRevision: number }
  | {
      readonly action: 'require_user_resolution';
      readonly currentRevision: number;
    };

/** Never silently replaces a grid once a user has edited it. */
export function decideBeatGridAdoption(
  current: BeatGridRevision | null
): BeatGridAdoptionDecision {
  if (current === null) {
    return { action: 'adopt', nextRevision: 1 };
  }
  const revision = requireNonNegativeInteger(current.revision, 'grid revision');
  if (current.origin === 'user') {
    return { action: 'require_user_resolution', currentRevision: revision };
  }
  return { action: 'replace_analysis', nextRevision: revision + 1 };
}
