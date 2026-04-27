import { describe, expect, it } from 'vitest';

import {
  addDaysIso,
  DEMO_MOMENTS,
  DEMO_PLAN_START_FRIDAY,
  DEMO_TOUR_DATES,
  fanNotificationForMoment,
  fridayOfWeek,
  generateDemoPlan,
  isFriday,
  laShowFriday,
  moveRemixNearLAShow,
  workflowTaskSlugsForMoment,
} from './demo-plan';
import { DEMO_WORKFLOW_TASKS_BY_SLUG } from './demo-workflow-tasks';

const REMIX_SLUG = 'remix-midnight-static';

describe('demo-plan invariants', () => {
  it('has exactly 12 moments', () => {
    expect(DEMO_MOMENTS).toHaveLength(12);
  });

  it('every moment falls on a Friday (UTC)', () => {
    for (const m of DEMO_MOMENTS) {
      expect(isFriday(m.friday), `${m.slug} on ${m.friday}`).toBe(true);
    }
  });

  it('moment slugs are unique', () => {
    const slugs = DEMO_MOMENTS.map(m => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('moments are sorted by friday ascending', () => {
    for (let i = 1; i < DEMO_MOMENTS.length; i++) {
      expect(DEMO_MOMENTS[i].friday >= DEMO_MOMENTS[i - 1].friday).toBe(true);
    }
  });

  it('start friday matches the first moment', () => {
    expect(isFriday(DEMO_PLAN_START_FRIDAY)).toBe(true);
    expect(DEMO_MOMENTS[0].friday).toBe(DEMO_PLAN_START_FRIDAY);
  });
});

describe('generateDemoPlan', () => {
  it('returns a fresh array each call (mutation does not leak)', () => {
    const a = generateDemoPlan();
    const b = generateDemoPlan();
    expect(a).not.toBe(b);
    a[0] = { ...a[0], friday: '1999-01-01' };
    expect(b[0].friday).toBe(DEMO_PLAN_START_FRIDAY);
    expect(DEMO_MOMENTS[0].friday).toBe(DEMO_PLAN_START_FRIDAY);
  });
});

describe('moveRemixNearLAShow', () => {
  it('does not mutate the input array or its elements', () => {
    const plan = generateDemoPlan();
    const remixBefore = plan.find(m => m.slug === REMIX_SLUG)!;
    const originalFriday = remixBefore.friday;
    const next = moveRemixNearLAShow(plan);
    expect(next).not.toBe(plan);
    expect(remixBefore.friday).toBe(originalFriday);
    expect(plan.find(m => m.slug === REMIX_SLUG)!.friday).toBe(originalFriday);
  });

  it('moves the remix to the Friday three days before the LA show', () => {
    const la = DEMO_TOUR_DATES.find(t => t.id === 'la')!;
    const target = laShowFriday();
    expect(isFriday(target)).toBe(true);
    expect(target <= la.date).toBe(true);
    const moved = moveRemixNearLAShow(generateDemoPlan());
    const remix = moved.find(m => m.slug === REMIX_SLUG)!;
    expect(remix.friday).toBe(target);
    if (isFriday(addDaysIso(la.date, -3))) {
      expect(addDaysIso(remix.friday, 3)).toBe(la.date);
    }
  });

  it('is idempotent', () => {
    const once = moveRemixNearLAShow(generateDemoPlan());
    const twice = moveRemixNearLAShow(once);
    expect(twice.map(m => m.friday)).toEqual(once.map(m => m.friday));
    expect(twice.map(m => m.slug)).toEqual(once.map(m => m.slug));
  });

  it('keeps exactly one remix moment after move', () => {
    const moved = moveRemixNearLAShow(generateDemoPlan());
    expect(moved.filter(m => m.slug === REMIX_SLUG)).toHaveLength(1);
    expect(moved).toHaveLength(DEMO_MOMENTS.length);
  });

  it('returns moments sorted by friday after move', () => {
    const moved = moveRemixNearLAShow(generateDemoPlan());
    for (let i = 1; i < moved.length; i++) {
      expect(moved[i].friday >= moved[i - 1].friday).toBe(true);
    }
  });
});

describe('workflowTaskSlugsForMoment', () => {
  it('returns 6–8 slugs that all exist in the workflow task map', () => {
    const types = Array.from(new Set(DEMO_MOMENTS.map(m => m.momentType)));
    for (const t of types) {
      const slugs = workflowTaskSlugsForMoment(t);
      expect(slugs.length).toBeGreaterThanOrEqual(6);
      expect(slugs.length).toBeLessThanOrEqual(8);
      for (const slug of slugs) {
        expect(DEMO_WORKFLOW_TASKS_BY_SLUG[slug]).toBeDefined();
      }
    }
  });
});

describe('fanNotificationForMoment', () => {
  it('sendsAt matches the moment friday', () => {
    for (const m of DEMO_MOMENTS) {
      const n = fanNotificationForMoment(m);
      expect(n.sendsAt).toBe(m.friday);
    }
  });
});

describe('date helpers', () => {
  it('addDaysIso wraps months and years', () => {
    expect(addDaysIso('2026-05-01', 7)).toBe('2026-05-08');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-05-08', -7)).toBe('2026-05-01');
  });

  it('isFriday is correct for known dates', () => {
    expect(isFriday('2026-05-01')).toBe(true);
    expect(isFriday('2026-05-02')).toBe(false);
    expect(isFriday('2026-10-23')).toBe(true);
    expect(isFriday('2026-10-26')).toBe(false);
  });

  it('fridayOfWeek snaps to the Friday on or before', () => {
    expect(fridayOfWeek('2026-10-23')).toBe('2026-10-23');
    expect(fridayOfWeek('2026-10-26')).toBe('2026-10-23');
    expect(fridayOfWeek('2026-10-29')).toBe('2026-10-23');
    expect(fridayOfWeek('2026-10-30')).toBe('2026-10-30');
  });
});
