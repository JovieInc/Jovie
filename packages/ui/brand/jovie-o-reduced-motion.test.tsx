import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JovieO } from './JovieO';
import { JOVIE_O_CSS, playOutcome } from './jovie-o-motion';
import { attachOvieEyes, blink } from './ovie-eyes';

describe('reduced motion is its own branch', () => {
  const animate = vi.fn(() => ({ finished: Promise.resolve() }));

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'animate', {
      value: animate,
      configurable: true,
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
      }))
    );
    animate.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  it('stops loops on the static O instead of slowing them', () => {
    const reduced = JOVIE_O_CSS.slice(JOVIE_O_CSS.indexOf('@media'));
    expect(reduced).toContain('animation:none!important');
    expect(reduced).toContain('stroke-dasharray:none');
    expect(reduced).not.toMatch(/@keyframes|opacity/);
  });

  it('turns success and error into plain state changes', async () => {
    const { container, rerender } = render(<JovieO state='loading' />);
    rerender(<JovieO state='error' />);
    rerender(<JovieO state='success' />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.dataset.joState).toBe('success');
    await playOutcome(
      {
        root: svg,
        turn: svg.querySelector('.jo-turn') as SVGGElement,
        tail: svg.querySelector('.jo-tail') as SVGPathElement,
      },
      'error',
      { rotation: 120, tail: 40 }
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it('never blinks, glances or perks', async () => {
    const root = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    ) as SVGSVGElement;
    const els = { root, irises: [], o: root, v: null };
    expect(attachOvieEyes(els, () => false)).toBeTypeOf('function');
    await blink(els);
    expect(animate).not.toHaveBeenCalled();
  });
});
