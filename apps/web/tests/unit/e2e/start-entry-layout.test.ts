import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installDelayedGuidanceLayoutProbe,
  installReplyLayoutProbe,
} from '../../e2e/utils/start-entry-layout';

let frames: FrameRequestCallback[];
let deliverEntries: PerformanceObserverCallback;
const observe = vi.fn();

function installObserver(supported: boolean) {
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = supported ? ['layout-shift'] : ['paint'];
      constructor(callback: PerformanceObserverCallback) {
        deliverEntries = callback;
      }
      observe = observe;
    }
  );
}

function deliverShifts(
  entries: { value: number; hadRecentInput: boolean; startTime?: number }[]
) {
  deliverEntries(
    {
      getEntries: () =>
        entries.map(entry => ({ startTime: entry.startTime ?? 0, ...entry })),
    } as unknown as PerformanceObserverEntryList,
    {} as PerformanceObserver
  );
}

function paintFrame() {
  const frame = frames.shift();
  expect(frame, 'the geometry probe must schedule a frame').toBeDefined();
  frame!(0);
}

beforeEach(() => {
  frames = [];
  observe.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    }
  );
  document.body.innerHTML = `
    <div data-testid="onboarding-empty-intro"><h1 data-y="10">Your first message</h1></div>
    <div data-testid="chat-empty-state-centered-composer" data-y="20">
      <textarea aria-label="Chat message input" data-y="30"></textarea>
      <button aria-label="Send message" data-y="40">Send</button>
    </div>
    <div data-testid="onboarding-flow-status"><p role="status">One quick check</p></div>`;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const hidden =
        this.hidden ||
        (this.getAttribute('role') === 'status' &&
          document.querySelector('#claim-delay-guidance'));
      return {
        y: Number(this.dataset.y ?? 0),
        width: 120,
        height: hidden ? 0 : 44,
      } as DOMRect;
    }
  );
});

afterEach(() => {
  document.head.querySelectorAll('style').forEach(style => style.remove());
  delete window.__claimInitialLayout;
  delete window.__claimLayout;
  delete window.__claimLayoutEntries;
  delete window.__armClaimLayout;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('start entry layout probes', () => {
  it.each([true, false])(
    'samples guidance geometry with layout-shift support=%s',
    supported => {
      installObserver(supported);
      installDelayedGuidanceLayoutProbe(24);
      expect(document.head.textContent).toContain(
        'font-size:24px;line-height:32px'
      );
      expect(document.querySelector('#claim-delay-guidance')).not.toBeNull();
      paintFrame();
      expect(window.__claimInitialLayout).toMatchObject({
        supported,
        total: supported ? 0 : null,
        unguidedFirst: true,
        first: [10, 20, 30, 40],
        guided: null,
      });
      document.querySelector('#claim-delay-guidance')!.remove();
      paintFrame();
      expect(window.__claimInitialLayout?.guided).toEqual([10, 20, 30, 40]);
      expect(frames).toHaveLength(0);
      expect(observe).toHaveBeenCalledTimes(supported ? 1 : 0);
    }
  );

  it('keeps sampling when PerformanceObserver is absent', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    installDelayedGuidanceLayoutProbe(32);
    paintFrame();
    expect(window.__claimInitialLayout?.first).toEqual([10, 20, 30, 40]);
    expect(window.__claimInitialLayout?.total).toBeNull();
  });

  it('waits for every essential control to have geometry', () => {
    installObserver(false);
    const input = document.querySelector('textarea')!;
    input.hidden = true;
    installDelayedGuidanceLayoutProbe(12);
    paintFrame();
    expect(window.__claimInitialLayout?.first).toBeNull();
    input.hidden = false;
    paintFrame();
    expect(window.__claimInitialLayout?.first).toEqual([10, 20, 30, 40]);
  });

  it('detects moved controls even when CLS is unavailable', () => {
    installObserver(false);
    installDelayedGuidanceLayoutProbe(12);
    paintFrame();
    document.querySelector('#claim-delay-guidance')!.remove();
    document.querySelector('textarea')!.dataset.y = '46';
    paintFrame();
    expect(window.__claimInitialLayout?.first?.[2]).toBe(30);
    expect(window.__claimInitialLayout?.guided?.[2]).toBe(46);
  });

  it('counts non-input layout shifts and exposes invalid measurements', () => {
    installObserver(true);
    installDelayedGuidanceLayoutProbe(12);
    expect(observe).toHaveBeenCalledWith({
      type: 'layout-shift',
      buffered: true,
    });
    deliverShifts([
      { value: 0.2, hadRecentInput: false },
      { value: 0.4, hadRecentInput: true },
    ]);
    expect(window.__claimInitialLayout?.total).toBe(0.2);
    deliverShifts([{ value: Number.NaN, hadRecentInput: false }]);
    expect(window.__claimInitialLayout?.total).toBeNaN();
  });

  it('reports unavailable reply CLS explicitly instead of a fabricated zero', () => {
    installObserver(false);
    installReplyLayoutProbe();
    window.__armClaimLayout?.();
    expect(window.__claimLayout).toEqual({ supported: false, total: null });
    expect(window.__claimLayoutEntries).toEqual([]);
    expect(observe).not.toHaveBeenCalled();
  });

  it('continues collecting reply CLS where the browser supports it', () => {
    installObserver(true);
    installReplyLayoutProbe();
    expect(observe).toHaveBeenCalledWith({ type: 'layout-shift' });
    deliverShifts([
      { value: 0.1, hadRecentInput: false },
      { value: 0.4, hadRecentInput: true },
    ]);
    expect(window.__claimLayout).toEqual({ supported: true, total: 0.1 });
  });

  it('drops handoff shifts from before the reply window, including late delivery, and still fails on an in-window shift', () => {
    installObserver(true);
    installReplyLayoutProbe();
    const node = document.createElement('div');
    node.id = 'composer';
    node.dataset.testid = 'onboarding-centered-composer';
    deliverEntries(
      {
        getEntries: () => [
          {
            value: 0.1503125,
            hadRecentInput: false,
            startTime: 40,
            sources: [
              {
                node,
                previousRect: { x: 0, y: 280, width: 1280, height: 319 },
                currentRect: { x: 0, y: 442, width: 1280, height: 319 },
              },
            ],
          },
          { value: 0.4, hadRecentInput: true, startTime: 50, sources: [] },
        ],
      } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver
    );
    expect(window.__claimLayout?.total).toBe(0.1503125);
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    window.__armClaimLayout?.();
    expect(window.__claimLayout?.total).toBe(0);
    expect(window.__claimLayoutEntries?.[0]).toMatchObject({
      value: 0.1503125,
      startTime: 40,
      counted: false,
      sources: [
        {
          node: {
            nodeName: 'DIV',
            id: 'composer',
            testId: 'onboarding-centered-composer',
          },
          previous: { y: 280, height: 319 },
          current: { y: 442, height: 319 },
        },
      ],
    });
    // The same pre-window entry, delivered after the window opens, stays out.
    deliverShifts([{ value: 0.1503125, hadRecentInput: false, startTime: 40 }]);
    expect(window.__claimLayout?.total).toBe(0);
    deliverShifts([
      { value: 0.02, hadRecentInput: false, startTime: 1_200 },
      { value: 0.4, hadRecentInput: true, startTime: 1_300 },
    ]);
    expect(window.__claimLayout?.total).toBe(0.02);
    expect(
      window.__claimLayoutEntries?.find(entry => entry.startTime === 1_200)
        ?.counted
    ).toBe(true);
  });

  it('poisons the reply window when an in-window shift value is not finite', () => {
    installObserver(true);
    installReplyLayoutProbe();
    vi.spyOn(performance, 'now').mockReturnValue(100);
    window.__armClaimLayout?.();
    deliverShifts([
      { value: Number.NaN, hadRecentInput: false, startTime: 10 },
    ]);
    expect(window.__claimLayout?.total).toBe(0);
    deliverShifts([
      { value: Number.NaN, hadRecentInput: false, startTime: 150 },
    ]);
    expect(window.__claimLayout?.total).toBeNaN();
  });
});
