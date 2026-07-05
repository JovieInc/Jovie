import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

import {
  RELEASE_CYCLE_STEP_KEYS,
  RELEASE_CYCLE_STEPS,
  deriveReleaseAutomationSummary,
  isReleaseCycleStepKey,
} from './release-cycle-classification';

describe('RELEASE_CYCLE_STEPS', () => {
  it('defines the canonical release-cycle step list per the demo workflow', () => {
    expect(RELEASE_CYCLE_STEP_KEYS).toEqual([
      'metadata',
      'smart_links',
      'pre_save',
      'press',
      'playlists',
      'content_posts',
      'fan_notifications',
      'merch',
      'reporting',
    ]);
  });

  it('has unique keys and positive baseline minutes on every step', () => {
    expect(new Set(RELEASE_CYCLE_STEP_KEYS).size).toBe(
      RELEASE_CYCLE_STEPS.length
    );
    for (const step of RELEASE_CYCLE_STEPS) {
      expect(step.baselineManualMinutes).toBeGreaterThan(0);
    }
  });

  it('validates step keys', () => {
    expect(isReleaseCycleStepKey('merch')).toBe(true);
    expect(isReleaseCycleStepKey('not_a_step')).toBe(false);
  });
});

describe('deriveReleaseAutomationSummary', () => {
  it('counts automated, manual, skipped, and untracked steps', () => {
    const summary = deriveReleaseAutomationSummary([
      { step: 'metadata', source: 'automation' },
      { step: 'smart_links', source: 'automation' },
      { step: 'pre_save', source: 'manual' },
      { step: 'press', source: 'skipped' },
    ]);

    expect(summary.automatedSteps).toBe(2);
    expect(summary.manualSteps).toBe(1);
    expect(summary.skippedSteps).toBe(1);
    // 9 canonical steps − 4 recorded = 5 untracked
    expect(summary.untrackedSteps).toBe(5);
  });

  it('derives manual tasks eliminated as the automated-step count', () => {
    const summary = deriveReleaseAutomationSummary([
      { step: 'metadata', source: 'automation' },
      { step: 'merch', source: 'automation' },
      { step: 'reporting', source: 'manual' },
    ]);

    expect(summary.manualTasksEliminated).toBe(2);
  });

  it('computes the time-saved proxy from per-step baseline minutes', () => {
    const summary = deriveReleaseAutomationSummary([
      { step: 'metadata', source: 'automation' }, // 30
      { step: 'merch', source: 'automation' }, // 120
      { step: 'press', source: 'manual' }, // not saved
    ]);

    expect(summary.timeSavedMinutes).toBe(150);
  });

  it('ignores unknown step keys and later events win per step', () => {
    const summary = deriveReleaseAutomationSummary([
      { step: 'bogus_step', source: 'automation' },
      { step: 'metadata', source: 'manual' },
      { step: 'metadata', source: 'automation' },
    ]);

    expect(summary.automatedSteps).toBe(1);
    expect(summary.manualSteps).toBe(0);
    expect(summary.manualTasksEliminated).toBe(1);
  });

  it('returns all-untracked for an empty event set', () => {
    const summary = deriveReleaseAutomationSummary([]);
    expect(summary.automatedSteps).toBe(0);
    expect(summary.manualSteps).toBe(0);
    expect(summary.skippedSteps).toBe(0);
    expect(summary.untrackedSteps).toBe(RELEASE_CYCLE_STEPS.length);
    expect(summary.manualTasksEliminated).toBe(0);
    expect(summary.timeSavedMinutes).toBe(0);
  });
});
