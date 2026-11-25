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
  OVIE_HOME_READY_MEASURE,
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
      startedAt: 0,
      readyAt: 3000.4,
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
  afterEach(() => {
    track.mockReset();
    vi.restoreAllMocks();
  });

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

  it.each([
    { navigation: 'hard', startedAt: 0, readyAt: 901.75, durationMs: 902 },
    { navigation: 'soft', startedAt: 120.25, readyAt: 901.75, durationMs: 782 },
  ] as const)(
    'anchors a $navigation trace to the sampled timestamps after a sink delay',
    ({ navigation, startedAt, readyAt, durationMs }) => {
      const now = vi.spyOn(performance, 'now').mockReturnValue(readyAt);
      const measure = vi.spyOn(performance, 'measure');
      track.mockImplementation(() => {
        now.mockReturnValue(readyAt + 250);
      });

      recordOvieHomeReady(
        ovieHomeReadySample(startedAt, performance.now(), navigation)
      );

      expect(performance.now()).toBe(readyAt + 250);
      expect(measure).toHaveBeenCalledWith(OVIE_HOME_READY_MEASURE, {
        start: startedAt,
        end: readyAt,
      });
      expect(track).toHaveBeenCalledWith(OVIE_HOME_READY_EVENT, {
        duration_ms: durationMs,
        navigation,
        budget_ms: OVIE_HOME_READY_BUDGET_MS,
        over_budget: false,
      });
      expect(
        getUxLatencySummaries().find(row => row.metric === 'ovie_home_ready')
      ).toMatchObject({ sampleCount: 1, p50Ms: durationMs });
    }
  );

  it('records a zero-length trace at the start if the clock goes backward', () => {
    const measure = vi.spyOn(performance, 'measure');

    recordOvieHomeReady(ovieHomeReadySample(500.25, 100.75, 'soft'));

    expect(measure).toHaveBeenCalledWith(OVIE_HOME_READY_MEASURE, {
      start: 500.25,
      end: 500.25,
    });
    expect(track).toHaveBeenCalledWith(
      OVIE_HOME_READY_EVENT,
      expect.objectContaining({ duration_ms: 0 })
    );
  });

  it('never throws when the Performance API refuses the measure', () => {
    vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('unsupported');
    });
    expect(() =>
      recordOvieHomeReady(ovieHomeReadySample(0, 100, 'soft'))
    ).not.toThrow();
  });
});
