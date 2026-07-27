import { describe, expect, it } from 'vitest';
import {
  type AudioBeatGridInput,
  type BeatGridRevision,
  createAudioBeatGrid,
  decideBeatGridAdoption,
} from './index';

const VALID_GRID_INPUT = {
  globalBpm: 120,
  beatPositions: [0, 0.5, 1, 1.5, 2],
  downbeatPositions: [0, 2],
  segments: [
    { startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 4 },
    { startsAt: 1.5, bpm: 122, beatIndex: 3, beatsPerBar: 4 },
  ],
} as const satisfies AudioBeatGridInput;

function gridInput(
  overrides: Partial<AudioBeatGridInput> = {}
): AudioBeatGridInput {
  return { ...VALID_GRID_INPUT, ...overrides };
}

describe('beat grid contract', () => {
  it('preserves detected beats, downbeats, and variable-tempo segments', () => {
    expect(createAudioBeatGrid(VALID_GRID_INPUT)).toEqual(VALID_GRID_INPUT);
    expect(
      createAudioBeatGrid(
        gridInput({
          segments: [
            { startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 1 },
            { startsAt: 2, bpm: 120, beatIndex: 4, beatsPerBar: 32 },
          ],
        })
      ).segments.map(segment => segment.beatsPerBar)
    ).toEqual([1, 32]);
  });

  it.each([
    [gridInput({ beatPositions: [] }), 'beat positions must not be empty'],
    [
      gridInput({ beatPositions: [0, 0.5, 0.5] }),
      'beat positions must be strictly increasing',
    ],
    [
      gridInput({ beatPositions: [0, 1, 0.5] }),
      'beat positions must be strictly increasing',
    ],
    [
      gridInput({ downbeatPositions: [2, 0] }),
      'downbeat positions must be strictly increasing',
    ],
    [
      gridInput({ downbeatPositions: [0, 0.75] }),
      'downbeat positions must reference detected beats',
    ],
  ] as const)('rejects an invalid beat sequence', (input, message) => {
    expect(() => createAudioBeatGrid(input)).toThrow(new RangeError(message));
  });

  it.each([
    [
      [{ startsAt: 0, bpm: 120, beatIndex: -1, beatsPerBar: 4 }],
      'segment beat index must be a non-negative integer',
    ],
    [
      [{ startsAt: 0, bpm: 120, beatIndex: 0.5, beatsPerBar: 4 }],
      'segment beat index must be a non-negative integer',
    ],
    [
      [{ startsAt: 0, bpm: 120, beatIndex: 5, beatsPerBar: 4 }],
      'segment beat indexes must be unique and ordered',
    ],
    [
      [
        { startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 4 },
        { startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 4 },
      ],
      'segment beat indexes must be unique and ordered',
    ],
    [
      [
        { startsAt: 0.5, bpm: 120, beatIndex: 1, beatsPerBar: 4 },
        { startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 4 },
      ],
      'segment beat indexes must be unique and ordered',
    ],
    [
      [{ startsAt: 0.25, bpm: 120, beatIndex: 0, beatsPerBar: 4 }],
      'segment start must match its detected beat',
    ],
    [
      [{ startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 0 }],
      'segment beats per bar must be an integer from 1 to 32',
    ],
    [
      [{ startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 33 }],
      'segment beats per bar must be an integer from 1 to 32',
    ],
    [
      [{ startsAt: 0, bpm: 120, beatIndex: 0, beatsPerBar: 4.5 }],
      'segment beats per bar must be an integer from 1 to 32',
    ],
    [
      [{ startsAt: 0, bpm: 0, beatIndex: 0, beatsPerBar: 4 }],
      'bpm must be greater than 0 and at most 400',
    ],
  ] as const)('rejects an invalid beat-grid segment', (segments, message) => {
    expect(() => createAudioBeatGrid(gridInput({ segments }))).toThrow(
      new RangeError(message)
    );
  });

  it('rejects invalid global tempo and negative beat positions', () => {
    expect(() => createAudioBeatGrid(gridInput({ globalBpm: 401 }))).toThrow(
      new RangeError('bpm must be greater than 0 and at most 400')
    );
    expect(() =>
      createAudioBeatGrid(
        gridInput({
          beatPositions: [-0.5, 0, 0.5],
          downbeatPositions: [0],
          segments: [
            { startsAt: -0.5, bpm: 120, beatIndex: 0, beatsPerBar: 4 },
          ],
        })
      )
    ).toThrow(new RangeError('seconds must be a finite, non-negative number'));
  });

  it('never silently overwrites a user-edited grid', () => {
    const grid = createAudioBeatGrid(VALID_GRID_INPUT);
    expect(decideBeatGridAdoption(null)).toEqual({
      action: 'adopt',
      nextRevision: 1,
    });
    expect(
      decideBeatGridAdoption({ origin: 'analysis', revision: 3, grid })
    ).toEqual({ action: 'replace_analysis', nextRevision: 4 });
    expect(
      decideBeatGridAdoption({ origin: 'user', revision: 7, grid })
    ).toEqual({ action: 'require_user_resolution', currentRevision: 7 });
    expect(() =>
      decideBeatGridAdoption({
        origin: 'analysis',
        revision: -1,
        grid,
      } as BeatGridRevision)
    ).toThrow(new RangeError('grid revision must be a non-negative integer'));
  });
});
