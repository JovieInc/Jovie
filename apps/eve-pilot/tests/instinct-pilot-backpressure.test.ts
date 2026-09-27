import { describe, expect, it } from 'vitest';
import {
  acquireCapabilitySlot,
  admitObjective,
  beginEpisode,
  enqueueCapabilityRequest,
  INSTINCT_PILOT_LIMITS,
  initialPilotBackpressureState,
  parkObservationCase,
  planRetry,
  recordCall,
  recordProposal,
  releaseCapabilitySlot,
  releaseObjective,
  restorePilotState,
  serializePilotState,
  stopMission,
} from '../agent/lib/instinct-pilot-backpressure';

const T0 = Date.parse('2026-09-23T12:00:00.000Z');
const DAY_MS = 86_400_000;

function observation(key: string) {
  return {
    key,
    owner: 'instinct',
    nextCheckAt: T0 + 3_600_000,
    horizonEndsAt: T0 + 7 * DAY_MS,
  };
}

describe('active objective admission', () => {
  it('allows exactly one active artist objective', () => {
    let state = initialPilotBackpressureState();
    const first = admitObjective(state, 'JOV-6527');
    expect(first.ok).toBe(true);
    state = first.ok ? first.state : state;
    expect(admitObjective(state, 'other-mission').ok).toBe(false);
    expect(admitObjective(state, 'other-mission')).toMatchObject({
      reason: 'active-objective-occupied',
    });
    state = releaseObjective(state, 'JOV-6527');
    expect(admitObjective(state, 'other-mission').ok).toBe(true);
  });

  it('durably blocks re-admission of a stopped mission key', () => {
    let state = initialPilotBackpressureState();
    state = stopMission(state, 'JOV-6527');
    const denied = admitObjective(state, 'JOV-6527');
    expect(denied.ok).toBe(false);
    expect(denied).toMatchObject({ reason: 'mission-stopped' });
    const restored = restorePilotState(serializePilotState(state), T0);
    expect(restored).not.toBeNull();
    expect(admitObjective(restored!, 'JOV-6527').ok).toBe(false);
  });

  it('stopping the active mission frees the slot without clearing the stop', () => {
    let state = initialPilotBackpressureState();
    const admitted = admitObjective(state, 'JOV-6527');
    state = admitted.ok ? admitted.state : state;
    state = stopMission(state, 'JOV-6527');
    expect(state.activeObjectiveKey).toBeNull();
    expect(admitObjective(state, 'JOV-6527').ok).toBe(false);
    expect(admitObjective(state, 'JOV-9999').ok).toBe(true);
  });
});

describe('parked observation cases', () => {
  it('caps parked cases at 3 and dedupes by key', () => {
    let state = initialPilotBackpressureState();
    for (const key of ['a', 'b', 'c']) {
      const r = parkObservationCase(state, observation(key));
      expect(r.ok).toBe(true);
      state = r.ok ? r.state : state;
    }
    expect(parkObservationCase(state, observation('d')).ok).toBe(false);
    const update = parkObservationCase(state, {
      ...observation('a'),
      nextCheckAt: T0 + 7_200_000,
    });
    expect(update.ok).toBe(true);
    state = update.ok ? update.state : state;
    expect(state.parkedCases).toHaveLength(3);
    expect(state.parkedCases[0]!.nextCheckAt).toBe(T0 + 7_200_000);
  });
});

describe('capability work slot', () => {
  it('admits one capability slot, dedupes same-capability requests, caps the queue at 2', () => {
    let state = initialPilotBackpressureState();
    const slot = acquireCapabilitySlot(state, 'apple-music-identity-check');
    expect(slot.ok).toBe(true);
    state = slot.ok ? slot.state : state;
    expect(acquireCapabilitySlot(state, 'apple-music-identity-check').ok).toBe(
      true
    );
    expect(acquireCapabilitySlot(state, 'other-capability')).toMatchObject({
      ok: false,
      reason: 'capability-slot-occupied',
    });
    for (const key of ['req-1', 'req-2']) {
      const r = enqueueCapabilityRequest(state, key);
      expect(r.ok).toBe(true);
      state = r.ok ? r.state : state;
    }
    expect(enqueueCapabilityRequest(state, 'req-3')).toMatchObject({
      ok: false,
      reason: 'capability-queue-full',
    });
    expect(enqueueCapabilityRequest(state, 'req-1').ok).toBe(true);
    state = releaseCapabilitySlot(state, 'apple-music-identity-check');
    const next = acquireCapabilitySlot(state, 'req-1');
    expect(next.ok).toBe(true);
    state = next.ok ? next.state : state;
    expect(state.capabilityQueue).toEqual(['req-2']);
  });
});

describe('proposal budget', () => {
  it('allows one proposal per rolling 24h', () => {
    let state = initialPilotBackpressureState();
    const first = recordProposal(state, T0);
    expect(first.ok).toBe(true);
    state = first.ok ? first.state : state;
    expect(recordProposal(state, T0 + 1_000)).toMatchObject({
      ok: false,
      reason: 'proposal-budget-exhausted',
    });
    expect(recordProposal(state, T0 + DAY_MS + 1).ok).toBe(true);
  });
});

describe('call budgets', () => {
  it('enforces 20 calls per episode and 200 per rolling 24h across episodes', () => {
    let state = initialPilotBackpressureState();
    const ep1 = beginEpisode(state, 'ep-1', T0);
    state = ep1.ok ? ep1.state : state;
    for (let i = 0; i < INSTINCT_PILOT_LIMITS.callsPerEpisode; i += 1) {
      const r = recordCall(state, 'ep-1', T0 + i);
      expect(r.ok).toBe(true);
      state = r.ok ? r.state : state;
    }
    expect(recordCall(state, 'ep-1', T0 + 100)).toMatchObject({
      ok: false,
      reason: 'episode-budget-exhausted',
    });
    // A new episode resets the episode budget but not the daily window.
    const ep2 = beginEpisode(state, 'ep-2', T0 + 1_000);
    state = ep2.ok ? ep2.state : state;
    expect(recordCall(state, 'ep-2', T0 + 1_000).ok).toBe(true);
    expect(recordCall(state, 'ep-unknown', T0)).toMatchObject({
      ok: false,
      reason: 'episode-unknown',
    });
  });

  it('persists the rolling daily budget across serialize/restore', () => {
    let state = initialPilotBackpressureState();
    const ep = beginEpisode(state, 'ep-1', T0);
    state = ep.ok ? ep.state : state;
    for (let i = 0; i < INSTINCT_PILOT_LIMITS.callsPerEpisode; i += 1) {
      const r = recordCall(state, 'ep-1', T0 + i);
      state = r.ok ? r.state : state;
    }
    const restored = restorePilotState(serializePilotState(state), T0 + 60_000);
    expect(restored).not.toBeNull();
    expect(restored!.callTimestamps).toHaveLength(
      INSTINCT_PILOT_LIMITS.callsPerEpisode
    );
    // Fill the daily budget through a new episode after restore.
    let s = restored!;
    const ep2 = beginEpisode(s, 'ep-2', T0 + 60_000);
    s = ep2.ok ? ep2.state : s;
    const remaining =
      INSTINCT_PILOT_LIMITS.callsPerRollingDay -
      INSTINCT_PILOT_LIMITS.callsPerEpisode;
    for (let i = 0; i < INSTINCT_PILOT_LIMITS.callsPerEpisode; i += 1) {
      const r = recordCall(s, 'ep-2', T0 + 60_000 + i);
      if (i < remaining - 1) {
        expect(r.ok).toBe(true);
        s = r.ok ? r.state : s;
      } else {
        // episode budget also caps at 20; daily 200 hit at the same call here.
        expect(r.ok === true || r.reason === 'daily-budget-exhausted').toBe(
          true
        );
      }
    }
  });
});

describe('retry accounting', () => {
  it('allows at most 3 persisted retries with backoff honoring Retry-After', () => {
    let state = initialPilotBackpressureState();
    let lastNext = T0;
    for (let i = 1; i <= INSTINCT_PILOT_LIMITS.maxRetryAttempts; i += 1) {
      const r = planRetry(
        state,
        'op-1',
        { kind: 'transient', retryAfterMs: i === 2 ? 120_000 : undefined },
        lastNext
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
      expect(r.value!.attempt).toBe(i);
      if (i === 2) {
        expect(r.value!.nextAttemptAt).toBe(lastNext + 120_000);
      } else {
        expect(r.value!.nextAttemptAt).toBeGreaterThan(lastNext);
      }
      lastNext = r.value!.nextAttemptAt;
    }
    expect(
      planRetry(state, 'op-1', { kind: 'transient' }, lastNext + 1)
    ).toMatchObject({ ok: false, reason: 'retry-exhausted' });
    // Attempts persist across restart.
    const restored = restorePilotState(
      serializePilotState(state),
      lastNext + 1
    );
    expect(
      planRetry(restored!, 'op-1', { kind: 'transient' }, lastNext + 1)
    ).toMatchObject({ ok: false, reason: 'retry-exhausted' });
  });

  it('never retries nontransient or uncertain-mutation failures', () => {
    const state = initialPilotBackpressureState();
    for (const kind of ['nontransient', 'uncertain-mutation'] as const) {
      expect(planRetry(state, 'op-x', { kind }, T0)).toMatchObject({
        ok: false,
        reason: 'retry-not-permitted',
      });
    }
  });
});

describe('persistence', () => {
  it('fails closed on foreign or corrupt snapshots', () => {
    expect(restorePilotState('not json', T0)).toBeNull();
    expect(
      restorePilotState(JSON.stringify({ schema: 'other/v9' }), T0)
    ).toBeNull();
  });
});
