import { describe, expect, it } from 'vitest';
import {
  IDLE_O_INPUTS,
  type OState,
  type OStateInputs,
  resolveOState,
} from './o-state';

type Row = readonly [
  name: string,
  inputs: Partial<OStateInputs>,
  expected: Omit<OState, 'sidebarInert'> & { sidebarInert?: boolean },
];

const playing = { audioActive: true, isPlaying: true } as const;
const paused = { audioActive: true, isPlaying: false } as const;

const home = {
  anchor: 'sidebar',
  mark: 'circle',
  sideSlot: 'none',
  sidebarInert: false,
} as const;
const mini = {
  anchor: 'sidebar',
  sideSlot: 'title',
  sidebarInert: false,
} as const;
const full = {
  id: 'S7',
  anchor: 'full-player',
  mark: 'circle',
  sideSlot: 'none',
  sidebarInert: true,
} as const;

/** Every row of the plan's state table, in priority order. */
const ROWS: readonly Row[] = [
  // S1, S2: home.
  ['S1 idle', {}, { ...home, id: 'S1' }],
  [
    'S2 a real update landed',
    { hasUpdate: true },
    { ...home, id: 'S2', sideSlot: 'update' },
  ],
  // S3, S4: composer.
  [
    'S3 page composer mounted (chat, Ovie Home)',
    { hasPageComposer: true },
    { ...home, id: 'S3', anchor: 'composer' },
  ],
  [
    'S4 floating composer open (no page composer, library included)',
    { floatingComposerOpen: true },
    { ...home, id: 'S4', anchor: 'composer' },
  ],
  [
    'S3 wins over S4: never two composers',
    { hasPageComposer: true, floatingComposerOpen: true },
    { ...home, id: 'S3', anchor: 'composer' },
  ],
  [
    'composer outranks an update (updates never take the mark)',
    { hasPageComposer: true, hasUpdate: true },
    { ...home, id: 'S3', anchor: 'composer' },
  ],
  // S5, S6: audio.
  [
    'S6 mini player, playing: pause glyph, title beside it',
    { ...playing },
    { ...mini, id: 'S6', mark: 'pause' },
  ],
  [
    'S6 mini player, paused: play glyph',
    { ...paused },
    { ...mini, id: 'S6', mark: 'play' },
  ],
  [
    'S5 now-playing flip after a user-started play',
    { ...playing, userStartedPlay: true },
    { ...mini, id: 'S5', mark: 'pause' },
  ],
  [
    'S6 on auto-advance: no flip, no change of open state',
    { ...playing, userStartedPlay: false },
    { ...mini, id: 'S6', mark: 'pause' },
  ],
  [
    'audio outranks the page composer (the mark leaves, the composer stays)',
    { ...playing, hasPageComposer: true },
    { ...mini, id: 'S6', mark: 'pause' },
  ],
  [
    'audio outranks the floating composer (it compacts into the O)',
    { ...paused, floatingComposerOpen: true },
    { ...mini, id: 'S6', mark: 'play' },
  ],
  [
    'audio outranks an update',
    { ...playing, hasUpdate: true },
    { ...mini, id: 'S6', mark: 'pause' },
  ],
  [
    'lyrics route, mini: no page composer, the O stays the player',
    { ...playing, hasPageComposer: false },
    { ...mini, id: 'S6', mark: 'pause' },
  ],
  // S7: full player.
  ['S7 full player open', { ...playing, fullPlayerOpen: true }, full],
  [
    'S7 full player open while paused',
    { ...paused, fullPlayerOpen: true },
    full,
  ],
  [
    'S7 beats a pending flip',
    { ...playing, fullPlayerOpen: true, userStartedPlay: true },
    full,
  ],
  [
    'lyrics route, full player open',
    { ...playing, fullPlayerOpen: true, hasPageComposer: false },
    full,
  ],
  // Priority 0: canvas transport.
  ['canvas transport with no audio', { canvasTransport: true }, full],
  [
    'canvas transport over a playing track',
    { ...playing, canvasTransport: true },
    full,
  ],
  [
    'canvas transport over the mini player',
    { ...playing, canvasTransport: true, fullPlayerOpen: false },
    full,
  ],
  [
    'canvas transport over a composer',
    { canvasTransport: true, hasPageComposer: true },
    full,
  ],
  // A full player flag with nothing loaded is stale state, not a transport.
  [
    'full flag without audio falls through to home',
    { fullPlayerOpen: true },
    { ...home, id: 'S1' },
  ],
  [
    'playing flag without a loaded track falls through to home',
    { isPlaying: true },
    { ...home, id: 'S1' },
  ],
];

describe('resolveOState', () => {
  it.each(ROWS)('%s', (_name, inputs, expected) => {
    const state = resolveOState({ ...IDLE_O_INPUTS, ...inputs });
    expect(state).toEqual({
      sidebarInert: false,
      ...expected,
    });
  });

  it('covers every state id at least once', () => {
    const ids = new Set(ROWS.map(([, , expected]) => expected.id));
    expect([...ids].sort()).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });

  it('inerts the sidebar O exactly when another surface is the transport', () => {
    for (const [name, inputs] of ROWS) {
      const state = resolveOState({ ...IDLE_O_INPUTS, ...inputs });
      expect(state.sidebarInert, name).toBe(state.id === 'S7');
    }
  });

  it('is pure: the same inputs give an equal state', () => {
    for (const [, inputs] of ROWS) {
      const input = { ...IDLE_O_INPUTS, ...inputs };
      expect(resolveOState(input)).toEqual(resolveOState({ ...input }));
    }
  });

  it('only ever shows the title slot while audio is loaded', () => {
    for (const [name, inputs] of ROWS) {
      const state = resolveOState({ ...IDLE_O_INPUTS, ...inputs });
      expect(state.sideSlot === 'title', name).toBe(
        state.id === 'S5' || state.id === 'S6'
      );
    }
  });
});
