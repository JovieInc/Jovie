import { describe, expect, it } from 'vitest';
import { isTimeLeverageFresh, timeLeverageSchema } from './time-leverage';

const valid = {
  schema: 'time-leverage/v1',
  observedAt: '2026-10-29T17:00:00.000Z',
  windowDays: 7,
  tim: {
    totalMinutes: 100,
    humanOnlyMinutes: 40,
    humanOnlyPct: 40,
    categories: [
      {
        id: 'taste_call',
        label: 'Taste call',
        class: 'human_only',
        minutes: 40,
      },
    ],
  },
  agent: { wastedAgentHours: 12, ciReworkRounds: 5, noOpWakes: 100 },
  proposals: [
    {
      id: 'a',
      title: 'Do a thing',
      estimate: '10 Tim-min/week',
      owner: 'Summer',
      score: 1.2,
    },
  ],
};

describe('time-leverage schema', () => {
  it('accepts the aggregate the driver emits', () => {
    expect(timeLeverageSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects more than three proposals and unknown classes', () => {
    const four = { ...valid, proposals: Array(4).fill(valid.proposals[0]) };
    expect(timeLeverageSchema.safeParse(four).success).toBe(false);
    const bad = structuredClone(valid);
    bad.tim.categories[0]!.class = 'other';
    expect(timeLeverageSchema.safeParse(bad).success).toBe(false);
  });

  it('expires after ten days', () => {
    const at = Date.parse(valid.observedAt);
    expect(isTimeLeverageFresh(valid.observedAt, at + 9 * 86_400_000)).toBe(
      true
    );
    expect(isTimeLeverageFresh(valid.observedAt, at + 11 * 86_400_000)).toBe(
      false
    );
  });
});
