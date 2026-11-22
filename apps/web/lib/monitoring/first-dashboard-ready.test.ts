import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  recordUxLatency: vi.fn(),
  postJsonBeacon: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/monitoring/interaction-latency', () => ({
  recordUxLatency: mocks.recordUxLatency,
}));
vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: mocks.postJsonBeacon,
}));

import {
  buildFirstDashboardReadySample,
  FIRST_DASHBOARD_READY_BUDGET_MS,
  FIRST_DASHBOARD_READY_ENDPOINT,
  isAboveTheFoldSettled,
  isHardShellLoad,
  recordFirstDashboardReady,
  splitFirstDashboardPhases,
  watchFirstDashboardReady,
} from './first-dashboard-ready';

function rect(top: number, height: number) {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('splitFirstDashboardPhases', () => {
  it('splits the load into server, document, boot and settle phases', () => {
    expect(
      splitFirstDashboardPhases({
        navigation: { responseStart: 180, responseEnd: 640 },
        hydratedAt: 1_420,
        readyAt: 1_900,
      })
    ).toEqual({
      serverMs: 180,
      documentMs: 460,
      bootMs: 780,
      settleMs: 480,
    });
  });

  it('clamps out-of-order boundaries so phases stay non-negative', () => {
    const phases = splitFirstDashboardPhases({
      navigation: { responseStart: 300, responseEnd: 200 },
      hydratedAt: 100,
      readyAt: 250,
    });
    expect(phases).toEqual({
      serverMs: 250,
      documentMs: 0,
      bootMs: 0,
      settleMs: 0,
    });
  });

  it('treats a missing navigation entry as zero-cost server time', () => {
    expect(
      splitFirstDashboardPhases({
        navigation: null,
        hydratedAt: 400,
        readyAt: 900,
      })
    ).toEqual({ serverMs: 0, documentMs: 0, bootMs: 400, settleMs: 500 });
  });
});

describe('buildFirstDashboardReadySample', () => {
  it('sums phases into the duration and flags only over-budget loads', () => {
    const fast = buildFirstDashboardReadySample({
      navigation: { responseStart: 100, responseEnd: 300 },
      hydratedAt: 800,
      readyAt: 1_200,
      outcome: 'reached',
      newAccount: true,
    });
    expect(fast).toMatchObject({
      contract: 'first-dashboard-ready/v1',
      durationMs: 1_200,
      newAccount: true,
      overBudget: false,
      budgetMs: FIRST_DASHBOARD_READY_BUDGET_MS,
    });
    const slow = buildFirstDashboardReadySample({
      navigation: null,
      hydratedAt: 1_000,
      readyAt: FIRST_DASHBOARD_READY_BUDGET_MS + 1,
      outcome: 'reached',
      newAccount: false,
    });
    expect(slow.overBudget).toBe(true);
    const timedOut = buildFirstDashboardReadySample({
      navigation: null,
      hydratedAt: 10,
      readyAt: 20,
      outcome: 'dropped',
      newAccount: false,
    });
    expect(timedOut.overBudget).toBe(true);
  });
});

describe('isAboveTheFoldSettled', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is unsettled while a skeleton or busy region is in the viewport', () => {
    document.body.innerHTML = `
      <div data-slot="skeleton" id="a"></div>
      <div aria-busy="true" id="b"></div>
      <div data-testid="opportunity-inbox-route-skeleton" id="c"></div>`;
    for (const id of ['a', 'b', 'c']) {
      for (const el of document.querySelectorAll('div')) {
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
          el.id === id ? rect(10, 20) : rect(0, 0)
        );
      }
      expect(isAboveTheFoldSettled(document, 800, 1280)).toBe(false);
    }
  });

  it('ignores loading regions below the fold or with no size', () => {
    document.body.innerHTML = `
      <div data-slot="skeleton" id="below"></div>
      <div aria-busy="true" id="empty"></div>
      <div id="content">Inbox</div>`;
    vi.spyOn(
      document.getElementById('below') as HTMLElement,
      'getBoundingClientRect'
    ).mockReturnValue(rect(900, 40));
    vi.spyOn(
      document.getElementById('empty') as HTMLElement,
      'getBoundingClientRect'
    ).mockReturnValue(rect(10, 0));
    expect(isAboveTheFoldSettled(document, 800, 1280)).toBe(true);
  });
});

describe('isHardShellLoad', () => {
  it('counts only the first mount of a navigated document', () => {
    expect(
      isHardShellLoad({
        firstMountInDocument: true,
        navigationType: 'navigate',
      })
    ).toBe(true);
    expect(
      isHardShellLoad({ firstMountInDocument: true, navigationType: null })
    ).toBe(true);
    expect(
      isHardShellLoad({ firstMountInDocument: true, navigationType: 'reload' })
    ).toBe(false);
    expect(
      isHardShellLoad({
        firstMountInDocument: true,
        navigationType: 'back_forward',
      })
    ).toBe(false);
    expect(
      isHardShellLoad({
        firstMountInDocument: false,
        navigationType: 'navigate',
      })
    ).toBe(false);
  });
});

describe('recordFirstDashboardReady', () => {
  beforeEach(() => {
    mocks.track.mockClear();
    mocks.recordUxLatency.mockClear();
    mocks.postJsonBeacon.mockClear();
    globalThis.__jovieFirstDashboardReady = undefined;
  });

  it('writes every sink with a duration-only payload', () => {
    const sample = buildFirstDashboardReadySample({
      navigation: { responseStart: 100, responseEnd: 300 },
      hydratedAt: 800,
      readyAt: 1_200,
      outcome: 'reached',
      newAccount: false,
    });
    recordFirstDashboardReady(sample);

    expect(globalThis.__jovieFirstDashboardReady).toEqual(sample);
    expect(mocks.recordUxLatency).toHaveBeenCalledWith(
      'first_dashboard_ready',
      1_200
    );
    expect(mocks.track).toHaveBeenCalledWith('first_dashboard_ready', {
      duration_ms: 1_200,
      outcome: 'reached',
      new_account: false,
      over_budget: false,
    });
    expect(mocks.postJsonBeacon).toHaveBeenCalledWith(
      FIRST_DASHBOARD_READY_ENDPOINT,
      {
        durationMs: 1_200,
        serverMs: 100,
        documentMs: 200,
        bootMs: 500,
        settleMs: 400,
        outcome: 'reached',
        newAccount: false,
      }
    );
  });

  it('keeps timed-out loads out of the local latency store', () => {
    recordFirstDashboardReady(
      buildFirstDashboardReadySample({
        navigation: null,
        hydratedAt: 10,
        readyAt: 30_000,
        outcome: 'dropped',
        newAccount: false,
      })
    );
    expect(mocks.recordUxLatency).not.toHaveBeenCalled();
    expect(mocks.postJsonBeacon).toHaveBeenCalledTimes(1);
  });

  it('never throws when a sink throws', () => {
    mocks.track.mockImplementationOnce(() => {
      throw new Error('gtag');
    });
    mocks.postJsonBeacon.mockImplementationOnce(() => {
      throw new Error('beacon');
    });
    expect(() =>
      recordFirstDashboardReady(
        buildFirstDashboardReadySample({
          navigation: null,
          hydratedAt: 1,
          readyAt: 2,
          outcome: 'reached',
          newAccount: false,
        })
      )
    ).not.toThrow();
  });
});

describe('watchFirstDashboardReady', () => {
  let frames: FrameRequestCallback[];
  let now: number;

  beforeEach(() => {
    frames = [];
    now = 1_000;
    mocks.postJsonBeacon.mockClear();
    document.body.innerHTML = '';
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runFrame = () => {
    const next = frames.shift();
    next?.(now);
  };

  it('records the first frame of a stable settled run', () => {
    document.body.innerHTML = '<div data-slot="skeleton" id="s"></div>';
    const skeleton = document.getElementById('s') as HTMLElement;
    vi.spyOn(skeleton, 'getBoundingClientRect').mockReturnValue(rect(10, 20));

    watchFirstDashboardReady({ hydratedAt: 900, newAccount: false });
    runFrame();
    expect(mocks.postJsonBeacon).not.toHaveBeenCalled();

    skeleton.remove();
    now = 1_400;
    runFrame();
    now = 1_417;
    runFrame();

    expect(mocks.postJsonBeacon).toHaveBeenCalledTimes(1);
    expect(mocks.postJsonBeacon.mock.calls[0]?.[1]).toMatchObject({
      durationMs: 1_400,
      outcome: 'reached',
    });
  });

  it('records nothing when the tab is hidden during the load', () => {
    watchFirstDashboardReady({ hydratedAt: 900, newAccount: false });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    runFrame();
    runFrame();
    expect(mocks.postJsonBeacon).not.toHaveBeenCalled();
  });

  it('reports a timeout as dropped', () => {
    document.body.innerHTML = '<div aria-busy="true" id="b"></div>';
    vi.spyOn(
      document.getElementById('b') as HTMLElement,
      'getBoundingClientRect'
    ).mockReturnValue(rect(0, 40));
    watchFirstDashboardReady({ hydratedAt: 900, newAccount: true });
    now = 30_001;
    runFrame();
    expect(mocks.postJsonBeacon.mock.calls[0]?.[1]).toMatchObject({
      outcome: 'dropped',
      newAccount: true,
    });
  });
});
