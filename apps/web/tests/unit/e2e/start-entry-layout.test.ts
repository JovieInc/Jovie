import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installDelayedGuidanceLayoutProbe,
  installReplyLayoutProbe,
  projectReplyLayoutEvidence,
} from '../../e2e/utils/start-entry-layout';

let frames: FrameRequestCallback[];
let frameTime: number;
let nextFrameId: number;
let fontStatus: FontFaceSet['status'];
let originalFontsDescriptor: PropertyDescriptor | undefined;
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

function paintFrame(elapsedMs = 16) {
  frameTime += elapsedMs;
  // A browser runs every callback queued for this frame together. Requests
  // made by those callbacks belong to the next frame, not this batch.
  const callbacks = frames;
  frames = [];
  expect(callbacks.length, 'the probes must schedule a frame').toBeGreaterThan(
    0
  );
  for (const callback of callbacks) callback(frameTime);
}

beforeEach(() => {
  frames = [];
  frameTime = 0;
  nextFrameId = 0;
  fontStatus = 'loading';
  originalFontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    get: () => ({ status: fontStatus }),
  });
  vi.spyOn(performance, 'now').mockImplementation(() => frameTime);
  observe.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return ++nextFrameId;
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
        x: Number(this.dataset.x ?? 0),
        y: Number(this.dataset.y ?? 0),
        width: Number(this.dataset.width ?? 120),
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
  delete window.__claimComposerFrames;
  delete window.__armClaimLayout;
  if (originalFontsDescriptor) {
    Object.defineProperty(document, 'fonts', originalFontsDescriptor);
  } else {
    Reflect.deleteProperty(document, 'fonts');
  }
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
      expect(window.__claimInitialLayout?.firstDetail).toMatchObject({
        composer: 'y=20.0 h=44.0',
        textarea: 'y=30.0 h=44.0 style=',
      });
      expect(window.__claimInitialLayout?.guidedDetail).toEqual(
        window.__claimInitialLayout?.firstDetail
      );
      // Guidance sampling has stopped; the independent sign-in trace remains
      // active until its bounded observation window ends.
      expect(frames).toHaveLength(1);
      paintFrame(2000);
      expect(frames).toHaveLength(0);
      expect(observe).toHaveBeenCalledTimes(supported ? 1 : 0);
    }
  );

  it('records only changed sign-in frames and keeps tracing after guidance appears', () => {
    installObserver(false);
    installDelayedGuidanceLayoutProbe(32);
    paintFrame();
    expect(window.__claimInitialLayout?.signInFrames).toEqual([
      {
        startTime: 16,
        text: null,
        rect: null,
        style: null,
        fontStatus: 'loading',
      },
    ]);

    const header = document.createElement('div');
    header.dataset.testid = 'onboarding-sign-in-header';
    const link = document.createElement('a');
    link.className = 'btn-linear-login';
    link.dataset.width = '34';
    link.style.cssText =
      'font: 450 13px Inter; padding-inline-start: 16px; padding-inline-end: 16px; border-inline-start-width: 1px; border-inline-end-width: 1px';
    header.append(link);
    document.body.append(header);
    document.querySelector('#claim-delay-guidance')!.remove();
    paintFrame();
    expect(window.__claimInitialLayout?.guided).toEqual([10, 20, 30, 40]);
    expect(window.__claimInitialLayout?.signInFrames?.at(-1)).toMatchObject({
      startTime: 32,
      text: '',
      rect: { x: 0, y: 0, width: 34, height: 44 },
      style: {
        fontSize: '13px',
        fontFamily: 'Inter',
        paddingInlineStart: '16px',
        paddingInlineEnd: '16px',
        borderInlineStartWidth: '1px',
        borderInlineEndWidth: '1px',
      },
    });

    paintFrame();
    expect(window.__claimInitialLayout?.signInFrames).toHaveLength(2);
    link.textContent = 'Sign in';
    link.dataset.width = '76';
    paintFrame();
    expect(window.__claimInitialLayout?.signInFrames?.at(-1)).toMatchObject({
      startTime: 64,
      text: 'Sign in',
      rect: { width: 76 },
      fontStatus: 'loading',
    });
    fontStatus = 'loaded';
    paintFrame();
    expect(window.__claimInitialLayout?.signInFrames).toHaveLength(4);
    expect(window.__claimInitialLayout?.signInFrames?.at(-1)).toMatchObject({
      startTime: 80,
      text: 'Sign in',
      fontStatus: 'loaded',
    });
  });

  it('stops scheduling the sign-in diagnostic after two seconds', () => {
    installObserver(true);
    installDelayedGuidanceLayoutProbe(12);
    paintFrame();
    document.querySelector('#claim-delay-guidance')!.remove();
    paintFrame();
    expect(frames).toHaveLength(1);
    paintFrame(1968);
    expect(frameTime).toBe(2000);
    expect(frames).toHaveLength(0);
    expect(window.__claimInitialLayout?.signInFrames).toHaveLength(1);
    // Ending the optional diagnostic does not stop the CLS observer or alter
    // the already captured essential-control geometry.
    expect(window.__claimInitialLayout?.guided).toEqual([10, 20, 30, 40]);
    deliverShifts([{ value: 0.1, hadRecentInput: false, startTime: 2100 }]);
    expect(window.__claimInitialLayout?.total).toBe(0.1);
  });

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
    expect(window.__claimInitialLayout?.entries).toEqual([
      { value: 0.2, startTime: 0, sources: undefined },
    ]);
    deliverShifts([{ value: Number.NaN, hadRecentInput: false }]);
    expect(window.__claimInitialLayout?.total).toBeNaN();
  });

  it('reports unavailable reply CLS explicitly instead of a fabricated zero', () => {
    installObserver(false);
    installReplyLayoutProbe();
    window.__armClaimLayout?.();
    expect(window.__claimLayout).toEqual({
      supported: false,
      total: null,
      windowStart: 0,
    });
    expect(
      projectReplyLayoutEvidence({
        ...window.__claimLayout!,
        measuredAt: performance.now(),
        entries: window.__claimLayoutEntries!,
      })
    ).toMatchObject({
      available: true,
      supported: false,
      total: null,
      totalFinite: false,
      windowStart: 0,
      entries: [],
    });
    expect(projectReplyLayoutEvidence(undefined)).toEqual({ available: false });
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
    expect(window.__claimLayout).toEqual({
      supported: true,
      total: 0.1,
      windowStart: 0,
    });
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
    expect(window.__claimLayout?.windowStart).toBe(0);
    frameTime = 1_000;
    window.__armClaimLayout?.();
    expect(window.__claimLayout?.total).toBe(0);
    expect(
      projectReplyLayoutEvidence({
        ...window.__claimLayout!,
        measuredAt: performance.now(),
        entries: window.__claimLayoutEntries!,
      })
    ).toMatchObject({ windowStart: 1_000, measuredAt: 1_000, total: 0 });
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

  it('retains unrounded reply measurements and numeric rectangles without DOM or private strings', () => {
    installObserver(true);
    installReplyLayoutProbe();
    const secret = 'PRIVATE_EMAIL_URL_TEXT';
    const node = document.createElement('div');
    node.id = secret;
    node.dataset.testid = secret;
    node.className = secret;
    node.textContent = secret;
    deliverEntries(
      {
        getEntries: () => [
          {
            value: 0.1503125,
            hadRecentInput: false,
            startTime: 40.125,
            sources: [
              {
                node,
                previousRect: { x: 1.25, y: 280.375, width: 1280, height: 319 },
                currentRect: { x: 1.25, y: 442.625, width: 1280, height: 319 },
              },
            ],
          },
          { value: 0.4, hadRecentInput: true, startTime: 50.875, sources: [] },
        ],
      } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver
    );
    frameTime = 123.456;
    const snapshot = {
      ...window.__claimLayout!,
      measuredAt: performance.now(),
      entries: window.__claimLayoutEntries!,
      composerFrames: [secret],
      extra: secret,
    };
    const before = structuredClone(snapshot);
    const evidence = projectReplyLayoutEvidence(snapshot);
    expect(evidence).toEqual({
      available: true,
      supported: true,
      total: 0.1503125,
      totalFinite: true,
      windowStart: 0,
      windowStartFinite: true,
      measuredAt: 123.456,
      measuredAtFinite: true,
      entries: [
        {
          value: 0.1503125,
          valueFinite: true,
          startTime: 40.125,
          startTimeFinite: true,
          hadRecentInput: false,
          counted: true,
          sources: [
            {
              previous: {
                x: 1.25,
                y: 280.375,
                width: 1280,
                height: 319,
                finite: true,
              },
              current: {
                x: 1.25,
                y: 442.625,
                width: 1280,
                height: 319,
                finite: true,
              },
            },
          ],
        },
        {
          value: 0.4,
          valueFinite: true,
          startTime: 50.875,
          startTimeFinite: true,
          hadRecentInput: true,
          counted: false,
          sources: [],
        },
      ],
    });
    expect(JSON.stringify(evidence)).not.toContain(secret);
    expect(snapshot).toEqual(before);
  });

  it('marks nonfinite reply evidence explicitly without inventing zero', () => {
    installObserver(true);
    installReplyLayoutProbe();
    deliverEntries(
      {
        getEntries: () => [
          {
            value: Number.NaN,
            hadRecentInput: false,
            startTime: 10,
            sources: [
              {
                previousRect: { x: 0, y: 0, width: 10, height: 10 },
                currentRect: {
                  x: Number.POSITIVE_INFINITY,
                  y: 1,
                  width: 10,
                  height: 10,
                },
              },
            ],
          },
        ],
      } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver
    );
    const evidence = projectReplyLayoutEvidence({
      ...window.__claimLayout!,
      measuredAt: performance.now(),
      entries: window.__claimLayoutEntries!,
    });
    expect(evidence).toMatchObject({
      supported: true,
      total: null,
      totalFinite: false,
      entries: [
        {
          value: null,
          valueFinite: false,
          sources: [
            {
              current: { x: null, y: 1, width: 10, height: 10, finite: false },
            },
          ],
        },
      ],
    });
    expect(window.__claimLayout?.total).toBeNaN();
    expect(window.__claimLayoutEntries?.[0].value).toBeNaN();
  });

  it('poisons the reply window when an in-window shift value is not finite', () => {
    installObserver(true);
    installReplyLayoutProbe();
    frameTime = 100;
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
