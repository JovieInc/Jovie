import {
  type AudioBeatGrid,
  type AudioBeatGridInput,
  createAudioBeatGrid,
} from './beat-grid';
import { type Seconds, seconds } from './units';

export const AUDIO_TIMELINE_DOCUMENT_VERSIONS = [1] as const;
export const AUDIO_TIMELINE_DOCUMENT_VERSION = 1 as const;

export const AUDIO_CUE_KINDS = [
  'intro',
  'verse',
  'chorus',
  'drop',
  'breakdown',
  'bridge',
  'outro',
  'custom',
] as const;

export type AudioCueKind = (typeof AUDIO_CUE_KINDS)[number];

declare const audioTimelineBrand: unique symbol;

export type AudioCueId = string & {
  readonly [audioTimelineBrand]: 'audio-cue-id';
};
export type AudioSampleOffset = number & {
  readonly [audioTimelineBrand]: 'audio-sample-offset';
};
export type AudioSampleRateHz = number & {
  readonly [audioTimelineBrand]: 'audio-sample-rate-hz';
};

export interface AudioCuePoint {
  readonly id: AudioCueId;
  readonly kind: AudioCueKind;
  readonly label: string;
  readonly sampleOffset: AudioSampleOffset;
}

export interface AudioTimelineDocumentV1 {
  readonly version: typeof AUDIO_TIMELINE_DOCUMENT_VERSION;
  readonly trackId: string;
  readonly revision: number;
  readonly sampleRateHz: AudioSampleRateHz;
  readonly durationSamples: AudioSampleOffset | null;
  readonly cues: readonly AudioCuePoint[];
  readonly beatGrid: AudioBeatGrid | null;
}

export interface AudioTimelineDocumentInput {
  readonly trackId: string;
  readonly revision: number;
  readonly sampleRateHz: number;
  readonly durationSamples: number | null;
  readonly cues: readonly {
    readonly id: string;
    readonly kind: AudioCueKind;
    readonly label: string;
    readonly sampleOffset: number;
  }[];
  readonly beatGrid: AudioBeatGrid | null;
}

export interface LegacyAudioTimelineDocumentV0 {
  readonly version: 0;
  readonly trackId: string;
  readonly revision: number;
  readonly durationSeconds: number | null;
  readonly cues: readonly {
    readonly id: string;
    readonly kind?: AudioCueKind;
    readonly label: string;
    readonly atSeconds: number;
  }[];
  readonly beatGrid: AudioBeatGridInput | null;
}

export type AudioTimelineEdit =
  | {
      readonly type: 'add';
      readonly cue: AudioTimelineDocumentInput['cues'][number];
    }
  | { readonly type: 'rename'; readonly cueId: string; readonly label: string }
  | {
      readonly type: 'move';
      readonly cueId: string;
      readonly sampleOffset: number;
    }
  | { readonly type: 'delete'; readonly cueId: string };

export interface AudioTimelineEditRequest {
  readonly expectedRevision: number;
  readonly edit: AudioTimelineEdit;
}

export interface AudioTimelineHistory {
  readonly past: readonly AudioTimelineDocumentV1[];
  readonly present: AudioTimelineDocumentV1;
  readonly future: readonly AudioTimelineDocumentV1[];
}

export interface AudioCueJumpTarget {
  readonly cueId: AudioCueId;
  readonly targetSeconds: Seconds;
  readonly sourceSampleOffset: AudioSampleOffset;
  readonly maximumQuantizationErrorSeconds: Seconds;
  readonly durationBound: 'known' | 'unknown';
  readonly clamped: boolean;
}

export const AUDIO_TIMELINE_HISTORY_LIMIT = 100;
export const AUDIO_CUE_LABEL_MAX_LENGTH = 80;
export const AUDIO_SAMPLE_RATE_MIN_HZ = 8_000;
export const AUDIO_SAMPLE_RATE_MAX_HZ = 384_000;

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0)
    throw new TypeError(`${field} must not be empty`);
  return normalized;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function sampleRateHz(value: number): AudioSampleRateHz {
  if (
    !Number.isInteger(value) ||
    value < AUDIO_SAMPLE_RATE_MIN_HZ ||
    value > AUDIO_SAMPLE_RATE_MAX_HZ
  ) {
    throw new RangeError(
      `sample rate must be an integer from ${AUDIO_SAMPLE_RATE_MIN_HZ} to ${AUDIO_SAMPLE_RATE_MAX_HZ}`
    );
  }
  return value as AudioSampleRateHz;
}

function sampleOffset(value: number, field: string): AudioSampleOffset {
  return nonNegativeInteger(value, field) as AudioSampleOffset;
}

function cueId(value: string): AudioCueId {
  const normalized = value.trim();
  if (!/^cue_[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new TypeError(
      'cue id must use the canonical cue_<lowercase-id> form'
    );
  }
  return normalized as AudioCueId;
}

function cueLabel(value: string): string {
  const normalized = nonEmpty(value, 'cue label');
  if (normalized.length > AUDIO_CUE_LABEL_MAX_LENGTH) {
    throw new RangeError(
      `cue label must not exceed ${AUDIO_CUE_LABEL_MAX_LENGTH} characters`
    );
  }
  return normalized;
}

function cueKind(value: AudioCueKind): AudioCueKind {
  if (!(AUDIO_CUE_KINDS as readonly string[]).includes(value)) {
    throw new TypeError('cue kind is not canonical');
  }
  return value;
}

function createCuePoint(
  input: AudioTimelineDocumentInput['cues'][number]
): AudioCuePoint {
  return {
    id: cueId(input.id),
    kind: cueKind(input.kind),
    label: cueLabel(input.label),
    sampleOffset: sampleOffset(input.sampleOffset, 'cue sample offset'),
  };
}

function toInput(
  document: AudioTimelineDocumentV1
): AudioTimelineDocumentInput {
  return {
    trackId: document.trackId,
    revision: document.revision,
    sampleRateHz: document.sampleRateHz,
    durationSamples: document.durationSamples,
    cues: document.cues,
    beatGrid: document.beatGrid,
  };
}

function normalizeBeatGrid(grid: AudioBeatGrid | null): AudioBeatGrid | null {
  if (grid === null) return null;
  return createAudioBeatGrid({
    globalBpm: grid.globalBpm,
    beatPositions: grid.beatPositions,
    downbeatPositions: grid.downbeatPositions,
    segments: grid.segments,
  });
}

export function createAudioTimelineDocument(
  input: AudioTimelineDocumentInput
): AudioTimelineDocumentV1 {
  const rate = sampleRateHz(input.sampleRateHz);
  const duration =
    input.durationSamples === null
      ? null
      : sampleOffset(input.durationSamples, 'timeline duration samples');
  const cues = input.cues.map(createCuePoint).sort((left, right) => {
    return left.sampleOffset - right.sampleOffset;
  });

  if (new Set(cues.map(cue => cue.id)).size !== cues.length) {
    throw new RangeError('cue ids must be unique');
  }
  if (
    cues.slice(1).some((cue, index) => {
      return cue.sampleOffset === cues[index]!.sampleOffset;
    })
  ) {
    throw new RangeError('cue sample offsets must be unique');
  }
  if (duration !== null && cues.some(cue => cue.sampleOffset > duration)) {
    throw new RangeError('cue sample offset must not exceed timeline duration');
  }

  return {
    version: AUDIO_TIMELINE_DOCUMENT_VERSION,
    trackId: nonEmpty(input.trackId, 'timeline track id'),
    revision: nonNegativeInteger(input.revision, 'timeline revision'),
    sampleRateHz: rate,
    durationSamples: duration,
    cues,
    beatGrid: normalizeBeatGrid(input.beatGrid),
  };
}

export function migrateLegacyAudioTimelineDocument(
  legacy: LegacyAudioTimelineDocumentV0,
  targetSampleRateHz: number
): AudioTimelineDocumentV1 {
  const rate = sampleRateHz(targetSampleRateHz);
  if (legacy.version !== 0) {
    throw new TypeError('legacy timeline document version must be 0');
  }
  const durationSamples =
    legacy.durationSeconds === null
      ? null
      : Math.round(legacy.durationSeconds * rate);
  return createAudioTimelineDocument({
    trackId: legacy.trackId,
    revision: legacy.revision,
    sampleRateHz: rate,
    durationSamples,
    cues: legacy.cues.map(cue => ({
      id: cue.id,
      kind: cue.kind ?? 'custom',
      label: cue.label,
      sampleOffset: Math.round(cue.atSeconds * rate),
    })),
    beatGrid:
      legacy.beatGrid === null ? null : createAudioBeatGrid(legacy.beatGrid),
  });
}

function cueIndex(document: AudioTimelineDocumentV1, id: string): number {
  const normalizedId = cueId(id);
  const index = document.cues.findIndex(cue => cue.id === normalizedId);
  if (index < 0) throw new RangeError('cue does not exist');
  return index;
}

export function applyAudioTimelineEdit(
  document: AudioTimelineDocumentV1,
  request: AudioTimelineEditRequest
): AudioTimelineDocumentV1 {
  if (request.expectedRevision !== document.revision) {
    throw new RangeError('timeline revision conflict');
  }

  const cues = [...document.cues];
  switch (request.edit.type) {
    case 'add': {
      const nextCue = createCuePoint(request.edit.cue);
      if (cues.some(cue => cue.id === nextCue.id)) {
        throw new RangeError('cue already exists');
      }
      cues.push(nextCue);
      break;
    }
    case 'rename': {
      const index = cueIndex(document, request.edit.cueId);
      cues[index] = { ...cues[index]!, label: cueLabel(request.edit.label) };
      break;
    }
    case 'move': {
      const index = cueIndex(document, request.edit.cueId);
      cues[index] = {
        ...cues[index]!,
        sampleOffset: sampleOffset(
          request.edit.sampleOffset,
          'cue sample offset'
        ),
      };
      break;
    }
    case 'delete': {
      cues.splice(cueIndex(document, request.edit.cueId), 1);
      break;
    }
  }

  return createAudioTimelineDocument({
    ...toInput(document),
    revision: document.revision + 1,
    cues,
  });
}

export function createAudioTimelineHistory(
  document: AudioTimelineDocumentV1
): AudioTimelineHistory {
  return { past: [], present: document, future: [] };
}

export function applyAudioTimelineHistoryEdit(
  history: AudioTimelineHistory,
  request: AudioTimelineEditRequest
): AudioTimelineHistory {
  const present = applyAudioTimelineEdit(history.present, request);
  return {
    past: [...history.past, history.present].slice(
      -AUDIO_TIMELINE_HISTORY_LIMIT
    ),
    present,
    future: [],
  };
}

function restoreSnapshot(
  snapshot: AudioTimelineDocumentV1,
  revision: number
): AudioTimelineDocumentV1 {
  return createAudioTimelineDocument({
    ...toInput(snapshot),
    revision,
  });
}

export function undoAudioTimelineEdit(
  history: AudioTimelineHistory,
  expectedRevision: number
): AudioTimelineHistory {
  if (expectedRevision !== history.present.revision) {
    throw new RangeError('timeline revision conflict');
  }
  const snapshot = history.past.at(-1);
  if (!snapshot) return history;
  return {
    past: history.past.slice(0, -1),
    present: restoreSnapshot(snapshot, history.present.revision + 1),
    future: [history.present, ...history.future].slice(
      0,
      AUDIO_TIMELINE_HISTORY_LIMIT
    ),
  };
}

export function redoAudioTimelineEdit(
  history: AudioTimelineHistory,
  expectedRevision: number
): AudioTimelineHistory {
  if (expectedRevision !== history.present.revision) {
    throw new RangeError('timeline revision conflict');
  }
  const [snapshot, ...future] = history.future;
  if (!snapshot) return history;
  return {
    past: [...history.past, history.present].slice(
      -AUDIO_TIMELINE_HISTORY_LIMIT
    ),
    present: restoreSnapshot(snapshot, history.present.revision + 1),
    future,
  };
}

export function resolveAudioCueJump(
  document: AudioTimelineDocumentV1,
  id: string,
  mediaDurationSeconds: number | null
): AudioCueJumpTarget {
  const cue = document.cues[cueIndex(document, id)]!;
  const rawTarget = cue.sampleOffset / document.sampleRateHz;
  const finiteDuration = mediaDurationSeconds ?? Number.NaN;
  const hasDuration = Number.isFinite(finiteDuration) && finiteDuration >= 0;
  const target = hasDuration ? Math.min(rawTarget, finiteDuration) : rawTarget;
  return {
    cueId: cue.id,
    targetSeconds: seconds(target),
    sourceSampleOffset: cue.sampleOffset,
    maximumQuantizationErrorSeconds: seconds(0.5 / document.sampleRateHz),
    durationBound: hasDuration ? 'known' : 'unknown',
    clamped: target !== rawTarget,
  };
}
