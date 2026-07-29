import { describe, expect, it } from 'vitest';
import {
  AUDIO_PERFORMANCE_BUDGET_IDS,
  AUDIO_PERFORMANCE_BUDGETS,
  getAudioPerformanceBudget,
} from './performance';

describe('audio performance budget registry', () => {
  it('keeps the registry exhaustive, unique, and strict', () => {
    expect(Object.keys(AUDIO_PERFORMANCE_BUDGETS)).toEqual(
      AUDIO_PERFORMANCE_BUDGET_IDS
    );
    expect(new Set(AUDIO_PERFORMANCE_BUDGET_IDS).size).toBe(
      AUDIO_PERFORMANCE_BUDGET_IDS.length
    );

    for (const id of AUDIO_PERFORMANCE_BUDGET_IDS) {
      const budget = getAudioPerformanceBudget(id);
      expect(budget.id).toBe(id);
      expect(budget.label.length).toBeGreaterThan(0);
      expect(budget.maxP95Ms).toBeGreaterThan(0);
      expect(budget.maxLongTasksPerRun).toBe(0);
    }
  });

  it('pins user-visible latency and continuity requirements', () => {
    expect(AUDIO_PERFORMANCE_BUDGETS['play-to-audible']).toMatchObject({
      measurement: 'event-to-media-state',
      maxP95Ms: 250,
      requiresPlaybackContinuity: false,
    });
    expect(AUDIO_PERFORMANCE_BUDGETS['pause-visual-response']).toMatchObject({
      measurement: 'event-to-paint',
      maxP95Ms: 50,
      requiresPlaybackContinuity: false,
    });
    expect(AUDIO_PERFORMANCE_BUDGETS['timeline-scrub-settle']).toMatchObject({
      measurement: 'event-to-media-state',
      maxP95Ms: 250,
      requiresPlaybackContinuity: true,
    });
    expect(AUDIO_PERFORMANCE_BUDGETS['cue-jump-settle']).toMatchObject({
      measurement: 'event-to-media-state',
      maxP95Ms: 250,
      requiresPlaybackContinuity: true,
    });
    expect(AUDIO_PERFORMANCE_BUDGETS['buffer-recovery']).toMatchObject({
      measurement: 'event-to-media-state',
      maxP95Ms: 1_000,
      requiresPlaybackContinuity: true,
    });
    expect(
      AUDIO_PERFORMANCE_BUDGETS['shell-transition-continuity']
    ).toMatchObject({
      measurement: 'event-to-paint',
      maxP95Ms: 100,
      requiresPlaybackContinuity: true,
    });
    expect(
      AUDIO_PERFORMANCE_BUDGETS['progress-notification-cadence']
    ).toMatchObject({
      measurement: 'cadence',
      maxP95Ms: 250,
      requiresPlaybackContinuity: true,
    });
  });
});
