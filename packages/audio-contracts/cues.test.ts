import { describe, expect, it } from 'vitest';
import {
  type AudioTimelineDocumentV1,
  applyAudioTimelineEdit,
  applyAudioTimelineHistoryEdit,
  createAudioTimelineDocument,
  createAudioTimelineHistory,
  redoAudioTimelineEdit,
  resolveAudioCueJump,
  undoAudioTimelineEdit,
} from './cues';

const RATE = 48_000;

function doc(
  cues: readonly {
    id: string;
    kind: 'intro' | 'verse' | 'chorus' | 'custom';
    label: string;
    sampleOffset: number;
  }[] = [],
  revision = 0
): AudioTimelineDocumentV1 {
  return createAudioTimelineDocument({
    trackId: 'track-1',
    revision,
    sampleRateHz: RATE,
    durationSamples: RATE * 60,
    cues,
    beatGrid: null,
  });
}

describe('createAudioTimelineDocument', () => {
  it('sorts cues by sample offset and stamps version 1', () => {
    const document = doc([
      { id: 'cue_b', kind: 'chorus', label: 'Chorus', sampleOffset: RATE * 30 },
      { id: 'cue_a', kind: 'intro', label: 'Intro', sampleOffset: 0 },
    ]);
    expect(document.version).toBe(1);
    expect(document.cues.map(cue => cue.id)).toEqual(['cue_a', 'cue_b']);
  });

  it('rejects duplicate sample offsets and out-of-bounds cues', () => {
    expect(() =>
      doc([
        { id: 'cue_a', kind: 'intro', label: 'A', sampleOffset: 10 },
        { id: 'cue_b', kind: 'verse', label: 'B', sampleOffset: 10 },
      ])
    ).toThrow(RangeError);
    expect(() =>
      doc([
        {
          id: 'cue_a',
          kind: 'outro' as 'intro',
          label: 'A',
          sampleOffset: RATE * 61,
        },
      ])
    ).toThrow(RangeError);
  });
});

describe('applyAudioTimelineEdit', () => {
  it('bumps the revision on every committed edit', () => {
    const added = applyAudioTimelineEdit(doc(), {
      expectedRevision: 0,
      edit: {
        type: 'add',
        cue: {
          id: 'cue_1',
          kind: 'verse',
          label: 'Verse 1',
          sampleOffset: RATE * 10,
        },
      },
    });
    expect(added.revision).toBe(1);
    expect(added.cues).toHaveLength(1);

    const renamed = applyAudioTimelineEdit(added, {
      expectedRevision: 1,
      edit: { type: 'rename', cueId: 'cue_1', label: 'Verse A' },
    });
    expect(renamed.cues[0]!.label).toBe('Verse A');

    const moved = applyAudioTimelineEdit(renamed, {
      expectedRevision: 2,
      edit: { type: 'move', cueId: 'cue_1', sampleOffset: RATE * 12 },
    });
    expect(moved.cues[0]!.sampleOffset).toBe(RATE * 12);

    const deleted = applyAudioTimelineEdit(moved, {
      expectedRevision: 3,
      edit: { type: 'delete', cueId: 'cue_1' },
    });
    expect(deleted.cues).toHaveLength(0);
  });

  it('rejects edits against a stale revision', () => {
    const document = doc();
    expect(() =>
      applyAudioTimelineEdit(document, {
        expectedRevision: 7,
        edit: { type: 'delete', cueId: 'cue_x' },
      })
    ).toThrow(RangeError);
  });
});

describe('timeline history', () => {
  it('supports undo/redo round-trips with revision continuity', () => {
    let history = createAudioTimelineHistory(doc());
    history = applyAudioTimelineHistoryEdit(history, {
      expectedRevision: 0,
      edit: {
        type: 'add',
        cue: {
          id: 'cue_1',
          kind: 'drop',
          label: 'Drop',
          sampleOffset: RATE * 20,
        },
      },
    });
    expect(history.present.cues).toHaveLength(1);

    const undone = undoAudioTimelineEdit(history, history.present.revision);
    expect(undone.present.cues).toHaveLength(0);
    expect(undone.present.revision).toBe(2);

    const redone = redoAudioTimelineEdit(undone, undone.present.revision);
    expect(redone.present.cues).toHaveLength(1);
    expect(redone.present.cues[0]!.label).toBe('Drop');
    expect(redone.present.revision).toBe(3);
  });
});

describe('resolveAudioCueJump', () => {
  it('maps cue offsets to seconds and clamps to known media duration', () => {
    const document = doc([
      { id: 'cue_a', kind: 'intro', label: 'Intro', sampleOffset: RATE * 5 },
      { id: 'cue_b', kind: 'outro', label: 'Outro', sampleOffset: RATE * 55 },
    ]);

    const jump = resolveAudioCueJump(document, 'cue_a', 60);
    expect(jump.targetSeconds).toBeCloseTo(5);
    expect(jump.clamped).toBe(false);
    expect(jump.durationBound).toBe('known');

    const clamped = resolveAudioCueJump(document, 'cue_b', 30);
    expect(clamped.targetSeconds).toBe(30);
    expect(clamped.clamped).toBe(true);

    const unknown = resolveAudioCueJump(document, 'cue_b', null);
    expect(unknown.targetSeconds).toBeCloseTo(55);
    expect(unknown.durationBound).toBe('unknown');
  });
});
