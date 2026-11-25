import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../test-utils/a11y';
import { OStroke } from './OStroke';
import { pathData, poseState, strokeFrame } from './ostroke-poses';

const frame = strokeFrame('24');
const dOf = (c: HTMLElement) =>
  (c.querySelector('path') as SVGPathElement).getAttribute('d');
const expected = (pose: Parameters<typeof poseState>[0], reduced = false) =>
  pathData(poseState(pose, frame, { reduced }).points);

describe('OStroke', () => {
  let raf: ReturnType<typeof vi.spyOn>;
  let matches = false;

  beforeEach(() => {
    vi.useFakeTimers();
    matches = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches, media: '' }))
    );
    raf = vi.spyOn(window, 'requestAnimationFrame');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    raf.mockRestore();
  });

  it('is decorative without a label and named with one', () => {
    const { container, rerender } = render(<OStroke size={24} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    rerender(<OStroke size={24} label='Jovie' />);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Jovie');
  });

  it('draws one path, and at rest schedules no animation frame', () => {
    const { container } = render(<OStroke size={24} />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(dOf(container)).toBe(expected('circle'));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(raf).not.toHaveBeenCalled();
  });

  it('morphs by writing d each frame, lands on the pose, then stops ticking', () => {
    const onEnd = vi.fn();
    const { container, rerender } = render(
      <OStroke size={24} onMorphEnd={onEnd} />
    );
    rerender(<OStroke size={24} pose='triangle' onMorphEnd={onEnd} />);
    expect(raf).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    const mid = dOf(container);
    expect(mid).not.toBe(expected('circle'));
    expect(mid).not.toBe(expected('triangle'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(dOf(container)).toBe(expected('triangle'));
    expect(onEnd).toHaveBeenCalledWith('triangle');
    raf.mockClear();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(raf).not.toHaveBeenCalled();
  });

  it('pause is a dash gap on the same single path', () => {
    const { container, rerender } = render(<OStroke size={24} />);
    rerender(<OStroke size={24} pose='pause' />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(
      (container.querySelector('path') as SVGPathElement).getAttribute(
        'stroke-dasharray'
      )
    ).toBeTruthy();
    rerender(<OStroke size={24} pose='circle' />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      (container.querySelector('path') as SVGPathElement).hasAttribute(
        'stroke-dasharray'
      )
    ).toBe(false);
  });

  it('a pose change mid-morph continues from where the line is', () => {
    const { container, rerender } = render(<OStroke size={24} />);
    rerender(<OStroke size={24} pose='line' />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const live = dOf(container);
    rerender(<OStroke size={24} pose='circle' />);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // no jump back to either end
    expect(dOf(container)).not.toBe(expected('line'));
    expect(dOf(container)).not.toBe(expected('circle'));
    expect(live).not.toBe(expected('circle'));
  });

  it('under reduced motion poses snap with no frame loop, wave is a static curve', () => {
    matches = true;
    const { container, rerender } = render(<OStroke size={24} />);
    rerender(<OStroke size={24} pose='triangle' />);
    expect(dOf(container)).toBe(expected('triangle'));
    rerender(<OStroke size={24} pose='wave' phase={1} />);
    expect(dOf(container)).toBe(expected('wave', true));
    rerender(<OStroke size={24} pose='wave' phase={2} />);
    expect(dOf(container)).toBe(expected('wave', true));
    expect(raf).not.toHaveBeenCalled();
  });

  it('wave phase writes d without a loop', () => {
    const { container, rerender } = render(<OStroke size={24} pose='wave' />);
    const before = dOf(container);
    rerender(<OStroke size={24} pose='wave' phase={1.2} />);
    expect(dOf(container)).not.toBe(before);
    expect(dOf(container)).toBe(
      pathData(poseState('wave', frame, { phase: 1.2 }).points)
    );
    expect(raf).not.toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    vi.useRealTimers();
    const { container } = render(<OStroke size={24} label='Jovie' />);
    await expectNoA11yViolations(container);
  });
});
