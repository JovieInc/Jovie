import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachOvieEyes, OVIE_EYES_TIMING } from './ovie-eyes';

describe('attachOvieEyes', () => {
  const animate = vi.fn(() => ({ finished: Promise.resolve() }));

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(Element.prototype, 'animate', {
      value: animate,
      configurable: true,
    });
    animate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  const els = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(ns, 'svg') as SVGSVGElement;
    const iris = document.createElementNS(ns, 'ellipse') as SVGEllipseElement;
    const o = document.createElementNS(ns, 'g') as SVGGElement;
    return { root, irises: [iris], o, v: null };
  };

  it('blinks rarely and stops at the per-page cap', async () => {
    const stop = attachOvieEyes(
      els(),
      () => false,
      () => 0
    );
    expect(animate).not.toHaveBeenCalled();
    for (let i = 0; i < OVIE_EYES_TIMING.maxBlinks + 3; i++) {
      await vi.advanceTimersByTimeAsync(OVIE_EYES_TIMING.blinkGapMs[1]);
    }
    expect(animate).toHaveBeenCalledTimes(OVIE_EYES_TIMING.maxBlinks);
    stop();
  });

  it('never blinks while the O is busy', async () => {
    const stop = attachOvieEyes(
      els(),
      () => true,
      () => 0
    );
    await vi.advanceTimersByTimeAsync(OVIE_EYES_TIMING.blinkGapMs[1] * 3);
    expect(animate).not.toHaveBeenCalled();
    stop();
  });
});
