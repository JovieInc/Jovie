import { describe, expect, it } from 'vitest';
import { summarizePhaseTimings } from './vitest-phase-timing-reporter';

describe('summarizePhaseTimings', () => {
  it('sums absolute per-module phase durations', () => {
    expect(
      summarizePhaseTimings([
        {
          environmentSetupDuration: 100,
          prepareDuration: 5,
          collectDuration: 50,
          setupDuration: 200,
          duration: 30,
          setupFetchDuration: 40,
          collectFetchDuration: 10,
        },
        {
          environmentSetupDuration: 120,
          prepareDuration: 7,
          collectDuration: 60,
          setupDuration: 220,
          duration: 70,
        },
      ])
    ).toEqual({
      source: 'vitest-phase-timing-reporter',
      moduleCount: 2,
      setup: 420,
      tests: 100,
      environment: 220,
      transform: 50,
      collect: 110,
      prepare: 12,
    });
  });

  it('ignores non-finite or negative durations instead of propagating NaN', () => {
    expect(
      summarizePhaseTimings([
        {
          environmentSetupDuration: Number.NaN,
          prepareDuration: -1,
          collectDuration: Number.POSITIVE_INFINITY,
          setupDuration: 10,
          duration: 20,
        },
      ])
    ).toMatchObject({
      setup: 10,
      tests: 20,
      environment: 0,
      prepare: 0,
      collect: 0,
      transform: 0,
    });
  });

  it('reports zero modules for an empty run', () => {
    expect(summarizePhaseTimings([]).moduleCount).toBe(0);
  });
});
