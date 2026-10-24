import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));

import {
  getUxLatencySummaries,
  resetUxLatencyForTests,
} from '@/lib/monitoring/interaction-latency';
import {
  OVIE_HOME_READY_BUDGET_MS,
  OVIE_HOME_READY_EVENT,
  ovieHomeReadySample,
  ovieHomeStart,
  recordOvieHomeReady,
} from './home-ready-timing';

describe('ovieHomeStart', () => {
  it('starts a hard load at the document time origin', () => {
    expect(
      ovieHomeStart({
        mountedAt: 1200,
        firstMountInDocument: true,
        documentPath: '/app/ov',
        currentPath: '/app/ov',
      })
    ).toEqual({ startedAt: 0, navigation: 'hard' });
  });

  it('starts a client navigation or a remount at mount time', () => {
    expect(
      ovieHomeStart({
        mountedAt: 1200,
        firstMountInDocument: true,
        documentPath: '/app/ov/inbox',
        currentPath: '/app/ov',
      })
    ).toEqual({ startedAt: 1200, navigation: 'soft' });
    expect(
      ovieHomeStart({
        mountedAt: 900,
        firstMountInDocument: false,
        documentPath: '/app/ov',
        currentPath: '/app/ov',
      })
    ).toEqual({ startedAt: 900, navigation: 'soft' });
  });
});

describe('ovieHomeReadySample', () => {
  it('flags samples over the warn-only budget', () => {
    expect(ovieHomeReadySample(0, 3000.4, 'hard')).toEqual({
      durationMs: 3000,
      navigation: 'hard',
      budgetMs: OVIE_HOME_READY_BUDGET_MS,
      overBudget: true,
    });
    expect(ovieHomeReadySample(100, 900, 'soft').overBudget).toBe(false);
    expect(ovieHomeReadySample(500, 100, 'soft').durationMs).toBe(0);
  });
});

describe('recordOvieHomeReady', () => {
  beforeEach(() => resetUxLatencyForTests());
  afterEach(() => track.mockReset());

  it('records the sample in the p50/p95 store and the analytics stream', () => {
    recordOvieHomeReady(ovieHomeReadySample(0, 3200, 'hard'));
    const summary = getUxLatencySummaries().find(
      row => row.metric === 'ovie_home_ready'
    );
    expect(summary).toMatchObject({ sampleCount: 1, p50Ms: 3200 });
    expect(track).toHaveBeenCalledWith(OVIE_HOME_READY_EVENT, {
      duration_ms: 3200,
      navigation: 'hard',
      budget_ms: OVIE_HOME_READY_BUDGET_MS,
      over_budget: true,
    });
  });

  it('never throws when the Performance API refuses the measure', () => {
    const spy = vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('unsupported');
    });
    expect(() =>
      recordOvieHomeReady(ovieHomeReadySample(0, 100, 'soft'))
    ).not.toThrow();
    spy.mockRestore();
  });
});
