import { describe, expect, it } from 'vitest';
import { resolveStepAutonomy } from './autonomy';
import { type PlaybookRunOutcome, planNextRun } from './iteration';
import { PLAYBOOK_TEMPLATES } from './registry';

const podcast = PLAYBOOK_TEMPLATES['podcast-episode'];

function run(overrides: Partial<PlaybookRunOutcome> = {}): PlaybookRunOutcome {
  return {
    reach: 1000,
    engagement: 100,
    newFollowers: 20,
    byChannel: {},
    whatWorked: [],
    recordedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('planNextRun', () => {
  it('uses the template as written on the first run', () => {
    const plan = planNextRun(podcast, []);
    expect(plan.runNumber).toBe(1);
    expect(plan.audienceTarget).toBeNull();
    expect(plan.stepPriority['second-clip']).toBe('medium');
  });

  it('aims past the best run so far', () => {
    const plan = planNextRun(podcast, [
      run({ reach: 1000 }),
      run({ reach: 800 }),
    ]);
    expect(plan.runNumber).toBe(3);
    expect(plan.audienceTarget).toBe(1250);
  });

  it('leans into channels that beat the average and away from dead ones', () => {
    const quietSocial = { reach: 400, engagement: 0 };
    const plan = planNextRun(podcast, [
      run({ byChannel: { social: quietSocial } }),
      run({
        reach: 1000,
        engagement: 100,
        byChannel: {
          short_video: { reach: 300, engagement: 90 },
          social: quietSocial,
        },
      }),
    ]);

    // short_video steps: medium -> high.
    expect(plan.stepPriority['second-clip']).toBe('high');
    expect(plan.stepPriority['cut-clips']).toBe('high');
    // social steps (tag-guest, medium) dropped a level after two dead runs.
    expect(plan.stepPriority['tag-guest']).toBe('low');
    // Urgent steps never move.
    expect(plan.stepPriority.publish).toBe('urgent');
    expect(plan.rationale.join(' ')).toContain('short_video');
  });
});

describe('resolveStepAutonomy', () => {
  it('keeps steps without a shipped agent hands-on in every mode', () => {
    expect(resolveStepAutonomy('autopilot', {})).toBe('hands_on');
    expect(
      resolveStepAutonomy('autopilot', {
        agentAssist: { agentType: 'not-shipped' },
      })
    ).toBe('hands_on');
  });

  it('passes the run level through for shipped agent steps', () => {
    const step = { agentAssist: { agentType: 'smart-link-create' } };
    expect(resolveStepAutonomy('review', step)).toBe('review');
    expect(resolveStepAutonomy('autopilot', step)).toBe('autopilot');
    expect(resolveStepAutonomy('hands_on', step)).toBe('hands_on');
  });
});
