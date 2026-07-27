import { describe, expect, it } from 'vitest';
import { createAudioBeatGrid } from './beat-grid';
import {
  AUDIO_CUE_KINDS,
  AUDIO_TIMELINE_DOCUMENT_VERSIONS,
  AUDIO_TIMELINE_HISTORY_LIMIT,
  applyAudioTimelineEdit,
  applyAudioTimelineHistoryEdit,
  createAudioTimelineDocument,
  createAudioTimelineHistory,
  migrateLegacyAudioTimelineDocument,
  redoAudioTimelineEdit,
  resolveAudioCueJump,
  undoAudioTimelineEdit,
} from './cues';

const GRID_INPUT = {
  globalBpm: 120,
  beatPositions: [0, 0.5, 1, 1.5],
  downbeatPositions: [0],
  segments: [{ startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 4 }],
} as const;

function documentInput() {
  return {
    trackId: 'track-1',
    revision: 2,
    sampleRateHz: 48_000,
    durationSamples: 480_000,
    cues: [
      {
        id: 'cue_intro',
        kind: 'intro' as const,
        label: ' Intro ',
        sampleOffset: 0,
      },
      {
        id: 'cue_drop',
        kind: 'drop' as const,
        label: 'Drop',
        sampleOffset: 240_000,
      },
    ],
    beatGrid: createAudioBeatGrid(GRID_INPUT),
  };
}

describe('audio timeline registry and validation', () => {
  it('pins canonical versions and cue kinds', () => {
    expect(AUDIO_TIMELINE_DOCUMENT_VERSIONS).toEqual([1]);
    expect(AUDIO_CUE_KINDS).toEqual([
      'intro',
      'verse',
      'chorus',
      'drop',
      'breakdown',
      'bridge',
      'outro',
      'custom',
    ]);
  });

  it('creates a normalized sample-indexed document', () => {
    const document = createAudioTimelineDocument({
      ...documentInput(),
      cues: [...documentInput().cues].reverse(),
    });
    expect(document).toMatchObject({
      version: 1,
      trackId: 'track-1',
      revision: 2,
      sampleRateHz: 48_000,
      durationSamples: 480_000,
    });
    expect(document.cues.map(cue => [cue.id, cue.label])).toEqual([
      ['cue_intro', 'Intro'],
      ['cue_drop', 'Drop'],
    ]);
    expect(
      createAudioTimelineDocument({
        ...documentInput(),
        sampleRateHz: 8_000,
        cues: [
          {
            ...documentInput().cues[0],
            id: ' cue_trimmed ',
            label: 'x'.repeat(80),
          },
        ],
      })
    ).toMatchObject({
      sampleRateHz: 8_000,
      cues: [{ id: 'cue_trimmed', label: 'x'.repeat(80) }],
    });
    expect(
      createAudioTimelineDocument({
        ...documentInput(),
        sampleRateHz: 384_000,
      }).sampleRateHz
    ).toBe(384_000);
  });

  it.each([
    [{ trackId: '  ' }, TypeError, 'timeline track id must not be empty'],
    [{ revision: -1 }, RangeError, 'timeline revision'],
    [{ revision: 0.5 }, RangeError, 'timeline revision'],
    [{ sampleRateHz: 7_999 }, RangeError, 'sample rate'],
    [{ sampleRateHz: 384_001 }, RangeError, 'sample rate'],
    [{ sampleRateHz: 44_100.5 }, RangeError, 'sample rate'],
    [{ durationSamples: -1 }, RangeError, 'timeline duration samples'],
    [
      { cues: [{ ...documentInput().cues[0], id: 'Intro' }] },
      TypeError,
      'canonical cue_',
    ],
    [
      { cues: [{ ...documentInput().cues[0], kind: 'hook' }] },
      TypeError,
      'cue kind',
    ],
    [
      { cues: [{ ...documentInput().cues[0], label: ' ' }] },
      TypeError,
      'cue label',
    ],
    [
      { cues: [{ ...documentInput().cues[0], label: 'x'.repeat(81) }] },
      RangeError,
      'cue label',
    ],
    [
      { cues: [{ ...documentInput().cues[0], sampleOffset: -1 }] },
      RangeError,
      'cue sample offset',
    ],
    [
      { cues: [{ ...documentInput().cues[0], sampleOffset: 1.2 }] },
      RangeError,
      'cue sample offset',
    ],
  ] as const)('rejects malformed timeline input %#', (override, ErrorType, message) => {
    expect(() =>
      createAudioTimelineDocument({
        ...documentInput(),
        ...override,
      } as ReturnType<typeof documentInput>)
    ).toThrow(ErrorType);
    expect(() =>
      createAudioTimelineDocument({
        ...documentInput(),
        ...override,
      } as ReturnType<typeof documentInput>)
    ).toThrow(message);
  });

  it('rejects duplicate ids, positions beyond duration, and colliding positions', () => {
    const input = documentInput();
    expect(() =>
      createAudioTimelineDocument({
        ...input,
        cues: [input.cues[0], { ...input.cues[1], id: 'cue_intro' }],
      })
    ).toThrow('cue ids must be unique');
    expect(() =>
      createAudioTimelineDocument({
        ...input,
        cues: [
          input.cues[0],
          { ...input.cues[1], sampleOffset: input.cues[0].sampleOffset },
        ],
      })
    ).toThrow('cue sample offsets must be unique');
    expect(() =>
      createAudioTimelineDocument({
        ...input,
        cues: [input.cues[0], { ...input.cues[1], sampleOffset: 480_001 }],
      })
    ).toThrow('must not exceed timeline duration');
    expect(
      createAudioTimelineDocument({
        ...input,
        cues: [{ ...input.cues[0], sampleOffset: 480_000 }],
      }).cues[0]?.sampleOffset
    ).toBe(480_000);
  });

  it('rejects cue ids with noncanonical prefixes or suffixes', () => {
    for (const id of ['prefix_cue_intro', 'cue_intro_suffix!', 'cue_intro/']) {
      expect(() =>
        createAudioTimelineDocument({
          ...documentInput(),
          cues: [{ ...documentInput().cues[0], id }],
        })
      ).toThrow('canonical cue_');
    }
  });

  it('revalidates beat grids at the timeline boundary', () => {
    expect(() =>
      createAudioTimelineDocument({
        ...documentInput(),
        beatGrid: {
          ...documentInput().beatGrid!,
          beatPositions: [0, 1, 0.5] as never,
        },
      })
    ).toThrow('beat positions must be strictly increasing');
  });

  it('accepts unknown duration without weakening cue validation', () => {
    const document = createAudioTimelineDocument({
      ...documentInput(),
      durationSamples: null,
      cues: [{ ...documentInput().cues[0], sampleOffset: 9_999_999_999 }],
    });
    expect(document.durationSamples).toBeNull();
    expect(document.cues[0]?.sampleOffset).toBe(9_999_999_999);
  });
});

describe('audio timeline migration', () => {
  it('migrates seconds, default cue kinds, duration, and beat grid to v1', () => {
    const migrated = migrateLegacyAudioTimelineDocument(
      {
        version: 0,
        trackId: 'track-1',
        revision: 4,
        durationSeconds: 10.25,
        cues: [
          { id: 'cue_a', label: 'A', atSeconds: 0.000_011 },
          { id: 'cue_b', kind: 'drop', label: 'B', atSeconds: 1.25 },
        ],
        beatGrid: GRID_INPUT,
      },
      48_000
    );
    expect(migrated).toMatchObject({
      version: 1,
      revision: 4,
      durationSamples: 492_000,
      sampleRateHz: 48_000,
    });
    expect(migrated.cues).toMatchObject([
      { id: 'cue_a', kind: 'custom', sampleOffset: 1 },
      { id: 'cue_b', kind: 'drop', sampleOffset: 60_000 },
    ]);
    expect(migrated.beatGrid?.globalBpm).toBe(120);
  });

  it('preserves unknown duration and rejects non-v0 or colliding migrations', () => {
    const base = {
      version: 0 as const,
      trackId: 'track-1',
      revision: 0,
      durationSeconds: null,
      cues: [{ id: 'cue_a', label: 'A', atSeconds: 1 }],
      beatGrid: null,
    };
    expect(
      migrateLegacyAudioTimelineDocument(base, 44_100).durationSamples
    ).toBeNull();
    expect(() =>
      migrateLegacyAudioTimelineDocument(
        { ...base, version: 1 } as never,
        44_100
      )
    ).toThrow('legacy timeline document version must be 0');
    expect(() =>
      migrateLegacyAudioTimelineDocument(
        {
          ...base,
          cues: [
            { id: 'cue_a', label: 'A', atSeconds: 0.000_001 },
            { id: 'cue_b', label: 'B', atSeconds: 0.000_002 },
          ],
        },
        44_100
      )
    ).toThrow('cue sample offsets must be unique');
  });
});

describe('audio timeline editing and history', () => {
  it('applies add, rename, move, and delete with monotonic revisions', () => {
    let document = createAudioTimelineDocument(documentInput());
    document = applyAudioTimelineEdit(document, {
      expectedRevision: 2,
      edit: {
        type: 'add',
        cue: {
          id: 'cue_verse',
          kind: 'verse',
          label: 'Verse',
          sampleOffset: 48_000,
        },
      },
    });
    expect(document.revision).toBe(3);
    expect(document.cues.map(cue => cue.id)).toEqual([
      'cue_intro',
      'cue_verse',
      'cue_drop',
    ]);

    document = applyAudioTimelineEdit(document, {
      expectedRevision: 3,
      edit: { type: 'rename', cueId: 'cue_verse', label: ' First Verse ' },
    });
    expect(document.cues[1]?.label).toBe('First Verse');

    document = applyAudioTimelineEdit(document, {
      expectedRevision: 4,
      edit: { type: 'move', cueId: 'cue_verse', sampleOffset: 300_000 },
    });
    expect(document.cues.at(-1)?.id).toBe('cue_verse');

    document = applyAudioTimelineEdit(document, {
      expectedRevision: 5,
      edit: { type: 'delete', cueId: 'cue_verse' },
    });
    expect(document.revision).toBe(6);
    expect(document.cues.some(cue => cue.id === 'cue_verse')).toBe(false);
  });

  it('fails closed on stale revisions, missing cues, duplicate ids, and collisions', () => {
    const document = createAudioTimelineDocument(documentInput());
    expect(() =>
      applyAudioTimelineEdit(document, {
        expectedRevision: 1,
        edit: { type: 'delete', cueId: 'cue_intro' },
      })
    ).toThrow('timeline revision conflict');
    for (const type of ['rename', 'move', 'delete'] as const) {
      expect(() =>
        applyAudioTimelineEdit(document, {
          expectedRevision: 2,
          edit:
            type === 'rename'
              ? { type, cueId: 'cue_missing', label: 'Missing' }
              : type === 'move'
                ? { type, cueId: 'cue_missing', sampleOffset: 1 }
                : { type, cueId: 'cue_missing' },
        })
      ).toThrow('cue does not exist');
    }
    expect(() =>
      applyAudioTimelineEdit(document, {
        expectedRevision: 2,
        edit: { type: 'add', cue: documentInput().cues[0] },
      })
    ).toThrow('cue already exists');
    expect(() =>
      applyAudioTimelineEdit(document, {
        expectedRevision: 2,
        edit: {
          type: 'move',
          cueId: 'cue_drop',
          sampleOffset: 0,
        },
      })
    ).toThrow('cue sample offsets must be unique');
    expect(() =>
      applyAudioTimelineEdit(document, {
        expectedRevision: 2,
        edit: {
          type: 'move',
          cueId: 'cue_drop',
          sampleOffset: -1,
        },
      })
    ).toThrow('cue sample offset must be a non-negative safe integer');
  });

  it('undoes and redoes content while keeping revisions monotonic', () => {
    const initial = createAudioTimelineDocument(documentInput());
    let history = createAudioTimelineHistory(initial);
    history = applyAudioTimelineHistoryEdit(history, {
      expectedRevision: 2,
      edit: { type: 'rename', cueId: 'cue_drop', label: 'First Drop' },
    });
    history = applyAudioTimelineHistoryEdit(history, {
      expectedRevision: 3,
      edit: { type: 'rename', cueId: 'cue_drop', label: 'Final Drop' },
    });
    expect(history.present.revision).toBe(4);
    expect(history.future).toEqual([]);

    history = undoAudioTimelineEdit(history, 4);
    expect(history.present.revision).toBe(5);
    expect(history.present.cues[1]?.label).toBe('First Drop');
    expect(history.past).toHaveLength(1);
    expect(history.future).toHaveLength(1);

    history = redoAudioTimelineEdit(history, 5);
    expect(history.present.revision).toBe(6);
    expect(history.present.cues[1]?.label).toBe('Final Drop');
    expect(history.past).toHaveLength(2);
    expect(history.future).toEqual([]);
  });

  it('keeps empty undo/redo as strict no-ops and rejects stale history actions', () => {
    const history = createAudioTimelineHistory(
      createAudioTimelineDocument(documentInput())
    );
    expect(undoAudioTimelineEdit(history, 2)).toBe(history);
    expect(redoAudioTimelineEdit(history, 2)).toBe(history);
    expect(() => undoAudioTimelineEdit(history, 1)).toThrow(
      'timeline revision conflict'
    );
    expect(() => redoAudioTimelineEdit(history, 1)).toThrow(
      'timeline revision conflict'
    );
  });

  it('bounds retained undo and redo snapshots', () => {
    let history = createAudioTimelineHistory(
      createAudioTimelineDocument({
        ...documentInput(),
        revision: 0,
        cues: [documentInput().cues[0]],
      })
    );
    for (let index = 0; index < AUDIO_TIMELINE_HISTORY_LIMIT + 5; index += 1) {
      history = applyAudioTimelineHistoryEdit(history, {
        expectedRevision: history.present.revision,
        edit: {
          type: 'rename',
          cueId: 'cue_intro',
          label: `Intro ${index}`,
        },
      });
    }
    expect(history.past).toHaveLength(AUDIO_TIMELINE_HISTORY_LIMIT);
    for (let index = 0; index < AUDIO_TIMELINE_HISTORY_LIMIT; index += 1) {
      history = undoAudioTimelineEdit(history, history.present.revision);
    }
    expect(history.future).toHaveLength(AUDIO_TIMELINE_HISTORY_LIMIT);

    const overfull = {
      past: Array.from(
        { length: AUDIO_TIMELINE_HISTORY_LIMIT + 5 },
        () => history.present
      ),
      present: history.present,
      future: Array.from(
        { length: AUDIO_TIMELINE_HISTORY_LIMIT },
        () => history.present
      ),
    };
    const undone = undoAudioTimelineEdit(overfull, overfull.present.revision);
    expect(undone.past).toHaveLength(AUDIO_TIMELINE_HISTORY_LIMIT + 4);
    expect(undone.future).toHaveLength(AUDIO_TIMELINE_HISTORY_LIMIT);

    const redone = redoAudioTimelineEdit(
      {
        past: Array.from(
          { length: AUDIO_TIMELINE_HISTORY_LIMIT },
          () => history.present
        ),
        present: history.present,
        future: [history.present],
      },
      history.present.revision
    );
    expect(redone.past).toHaveLength(AUDIO_TIMELINE_HISTORY_LIMIT);
    expect(redone.future).toEqual([]);
  });
});

describe('audio cue jump resolution', () => {
  it('resolves a sample-indexed cue with an explicit quantization bound', () => {
    const document = createAudioTimelineDocument(documentInput());
    expect(resolveAudioCueJump(document, 'cue_drop', 10)).toEqual({
      cueId: 'cue_drop',
      targetSeconds: 5,
      sourceSampleOffset: 240_000,
      maximumQuantizationErrorSeconds: 0.5 / 48_000,
      durationBound: 'known',
      clamped: false,
    });
  });

  it('clamps to known media duration and preserves unknown-duration targets', () => {
    const document = createAudioTimelineDocument({
      ...documentInput(),
      durationSamples: null,
      cues: [{ ...documentInput().cues[0], sampleOffset: 960_000 }],
    });
    expect(resolveAudioCueJump(document, 'cue_intro', 10)).toMatchObject({
      targetSeconds: 10,
      durationBound: 'known',
      clamped: true,
    });
    expect(resolveAudioCueJump(document, 'cue_intro', null)).toMatchObject({
      targetSeconds: 20,
      durationBound: 'unknown',
      clamped: false,
    });
    expect(
      resolveAudioCueJump(document, 'cue_intro', Number.NaN)
    ).toMatchObject({ targetSeconds: 20, durationBound: 'unknown' });
    expect(resolveAudioCueJump(document, 'cue_intro', -1)).toMatchObject({
      targetSeconds: 20,
      durationBound: 'unknown',
      clamped: false,
    });
    expect(resolveAudioCueJump(document, 'cue_intro', 0)).toMatchObject({
      targetSeconds: 0,
      durationBound: 'known',
      clamped: true,
    });
  });

  it('rejects missing or malformed cue ids', () => {
    const document = createAudioTimelineDocument(documentInput());
    expect(() => resolveAudioCueJump(document, 'cue_missing', 10)).toThrow(
      'cue does not exist'
    );
    expect(() => resolveAudioCueJump(document, 'DROP', 10)).toThrow(
      'canonical cue_'
    );
  });
});
