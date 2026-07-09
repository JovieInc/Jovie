import { describe, expect, it } from 'vitest';
import {
  hasReachedListenThreshold,
  type PacContext,
  type PacState,
  pacReducer,
  resolveInitialPacState,
  resolveS2State,
  stageOf,
} from '@/components/features/profile/pac/pac-machine';

const fullInventory = {
  hasPreview: true,
  hasMerch: true,
  hasTip: true,
  hasTicketedShow: true,
  hasUpcomingShow: true,
} as const;

function ctx(overrides: Partial<PacContext> = {}): PacContext {
  return {
    tier: 'cold',
    s2Slot: 'merch',
    captureSuppressed: false,
    inventory: fullInventory,
    ...overrides,
  };
}

describe('stageOf', () => {
  it('maps all twelve states to their stage', () => {
    expect(stageOf('idle')).toBe('s0');
    expect(stageOf('playing')).toBe('s0');
    expect(stageOf('prompt')).toBe('s1');
    expect(stageOf('submitting')).toBe('s1');
    expect(stageOf('error')).toBe('s1');
    expect(stageOf('success')).toBe('s1');
    expect(stageOf('dismissed')).toBe('s1');
    expect(stageOf('merch')).toBe('s2');
    expect(stageOf('tip')).toBe('s2');
    expect(stageOf('tickets')).toBe('s2');
    expect(stageOf('rsvp')).toBe('s2');
    expect(stageOf('following')).toBe('s2');
  });
});

describe('resolveInitialPacState', () => {
  it('cold visitor lands in S0 idle (the server-rendered default)', () => {
    expect(resolveInitialPacState(ctx())).toEqual({
      kind: 'idle',
      stage: 's0',
      degraded: false,
    });
  });

  it('cold visitor without a preview lands in degraded S0 idle', () => {
    const state = resolveInitialPacState(
      ctx({ inventory: { ...fullInventory, hasPreview: false } })
    );
    expect(state.kind).toBe('idle');
    expect(state.degraded).toBe(true);
  });

  it('warmed visitor lands in the capture prompt', () => {
    expect(resolveInitialPacState(ctx({ tier: 'warmed' })).kind).toBe('prompt');
  });

  it('warmed but suppressed visitor lands in dismissed (single-interruption)', () => {
    const state = resolveInitialPacState(
      ctx({ tier: 'warmed', captureSuppressed: true })
    );
    expect(state.kind).toBe('dismissed');
  });

  it('captured visitor lands in the assigned S2 slot', () => {
    expect(
      resolveInitialPacState(ctx({ tier: 'captured', s2Slot: 'tip' })).kind
    ).toBe('tip');
  });
});

describe('resolveS2State degraded ladder', () => {
  it('uses the assigned slot when inventory is available', () => {
    const state = resolveS2State(ctx({ tier: 'captured', s2Slot: 'tickets' }));
    expect(state).toEqual({ kind: 'tickets', stage: 's2', degraded: false });
  });

  it('falls down the ladder when the assigned slot is empty', () => {
    const state = resolveS2State(
      ctx({
        tier: 'captured',
        s2Slot: 'merch',
        inventory: { ...fullInventory, hasMerch: false, hasTip: false },
      })
    );
    expect(state.kind).toBe('tickets');
    expect(state.degraded).toBe(true);
  });

  it('rsvp falls back to any upcoming show without tickets', () => {
    const state = resolveS2State(
      ctx({
        tier: 'captured',
        s2Slot: 'tickets',
        inventory: {
          ...fullInventory,
          hasMerch: false,
          hasTip: false,
          hasTicketedShow: false,
          hasUpcomingShow: true,
        },
      })
    );
    expect(state.kind).toBe('rsvp');
    expect(state.degraded).toBe(true);
  });

  it('falls back to following when nothing is available', () => {
    const state = resolveS2State(
      ctx({
        tier: 'captured',
        s2Slot: 'merch',
        inventory: {
          hasPreview: false,
          hasMerch: false,
          hasTip: false,
          hasTicketedShow: false,
          hasUpcomingShow: false,
        },
      })
    );
    expect(state).toEqual({ kind: 'following', stage: 's2', degraded: true });
  });
});

describe('pacReducer transitions', () => {
  const idle: PacState = { kind: 'idle', stage: 's0', degraded: false };
  const playing: PacState = { kind: 'playing', stage: 's0', degraded: false };
  const prompt: PacState = { kind: 'prompt', stage: 's1', degraded: false };
  const submitting: PacState = {
    kind: 'submitting',
    stage: 's1',
    degraded: false,
  };
  const error: PacState = { kind: 'error', stage: 's1', degraded: false };

  it('idle + PLAY → playing (only when a preview exists)', () => {
    expect(pacReducer(idle, { type: 'PLAY' }, ctx()).kind).toBe('playing');
    expect(
      pacReducer(
        idle,
        { type: 'PLAY' },
        ctx({ inventory: { ...fullInventory, hasPreview: false } })
      ).kind
    ).toBe('idle');
  });

  it('playing + PAUSE → idle', () => {
    expect(pacReducer(playing, { type: 'PAUSE' }, ctx()).kind).toBe('idle');
  });

  it('playing + LISTEN_THRESHOLD → prompt for cold visitors', () => {
    expect(pacReducer(playing, { type: 'LISTEN_THRESHOLD' }, ctx()).kind).toBe(
      'prompt'
    );
  });

  it('LISTEN_THRESHOLD never interrupts captured or suppressed visitors', () => {
    expect(
      pacReducer(
        playing,
        { type: 'LISTEN_THRESHOLD' },
        ctx({ tier: 'captured' })
      ).kind
    ).toBe('playing');
    expect(
      pacReducer(
        playing,
        { type: 'LISTEN_THRESHOLD' },
        ctx({ captureSuppressed: true })
      ).kind
    ).toBe('playing');
  });

  it('capture happy path: prompt → submitting → success', () => {
    const s1 = pacReducer(prompt, { type: 'CAPTURE_SUBMIT' }, ctx());
    expect(s1.kind).toBe('submitting');
    expect(pacReducer(s1, { type: 'CAPTURE_SUCCESS' }, ctx()).kind).toBe(
      'success'
    );
  });

  it('capture failure path: submitting → error → retry → prompt', () => {
    const failed = pacReducer(submitting, { type: 'CAPTURE_FAILURE' }, ctx());
    expect(failed.kind).toBe('error');
    expect(pacReducer(failed, { type: 'RETRY' }, ctx()).kind).toBe('prompt');
  });

  it('prompt + DISMISS → dismissed', () => {
    expect(pacReducer(prompt, { type: 'DISMISS' }, ctx()).kind).toBe(
      'dismissed'
    );
  });

  it('RESOLVE re-resolves at rest but never interrupts an active conversation', () => {
    const captured = ctx({ tier: 'captured', s2Slot: 'merch' });
    expect(pacReducer(idle, { type: 'RESOLVE' }, captured).kind).toBe('merch');
    expect(pacReducer(prompt, { type: 'RESOLVE' }, captured).kind).toBe(
      'prompt'
    );
    expect(pacReducer(submitting, { type: 'RESOLVE' }, captured).kind).toBe(
      'submitting'
    );
    expect(pacReducer(playing, { type: 'RESOLVE' }, captured).kind).toBe(
      'playing'
    );
  });

  it('unknown combinations return the current state unchanged', () => {
    expect(pacReducer(error, { type: 'PLAY' }, ctx())).toBe(error);
    expect(pacReducer(idle, { type: 'CAPTURE_SUCCESS' }, ctx())).toBe(idle);
  });
});

describe('hasReachedListenThreshold', () => {
  it('30s arm fires at 30 seconds', () => {
    expect(hasReachedListenThreshold('30s', 29, 180)).toBe(false);
    expect(hasReachedListenThreshold('30s', 30, 180)).toBe(true);
  });

  it('30s arm fires at track end for short tracks', () => {
    expect(hasReachedListenThreshold('30s', 14.8, 15)).toBe(true);
    expect(hasReachedListenThreshold('30s', 10, 15)).toBe(false);
  });

  it('track_complete arm fires only near the end', () => {
    expect(hasReachedListenThreshold('track_complete', 30, 180)).toBe(false);
    expect(hasReachedListenThreshold('track_complete', 179.6, 180)).toBe(true);
  });

  it('never fires with unknown duration', () => {
    expect(hasReachedListenThreshold('30s', 45, 0)).toBe(false);
  });
});
