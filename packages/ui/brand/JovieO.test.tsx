import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JovieO } from './JovieO';

const svg = (c: HTMLElement) => c.querySelector('svg') as SVGSVGElement;

describe('JovieO', () => {
  it('is decorative without a label and named with one', () => {
    const { container, rerender } = render(<JovieO />);
    expect(svg(container).getAttribute('aria-hidden')).toBe('true');
    expect(svg(container).getAttribute('role')).toBeNull();
    rerender(<JovieO label='Jovie' />);
    expect(svg(container).getAttribute('role')).toBe('img');
    expect(svg(container).getAttribute('aria-label')).toBe('Jovie');
  });

  it('draws the 16 px pixel master on a 16 unit box at chrome size', () => {
    const { container } = render(<JovieO size={20} />);
    expect(svg(container).getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg(container).getAttribute('height')).toBe('20');
  });

  it('drives data-jo-state through every state', () => {
    const { container, rerender } = render(<JovieO state='loading' />);
    expect(svg(container).dataset.joState).toBe('loading');
    for (const state of ['thinking', 'success', 'error', 'idle'] as const) {
      rerender(<JovieO state={state} />);
      expect(svg(container).dataset.joState).toBe(state);
    }
  });

  it('fills the counter at rest so a blink closes it, and not while busy', () => {
    const { container, rerender } = render(<JovieO state='idle' />);
    const whiteEllipses = () =>
      container.querySelectorAll('mask ellipse[fill="#fff"]').length;
    expect(whiteEllipses()).toBe(1);
    rerender(<JovieO state='loading' />);
    expect(whiteEllipses()).toBe(0);
  });

  it('keeps mask ids unique per instance', () => {
    const { container } = render(
      <>
        <JovieO />
        <JovieO />
      </>
    );
    const ids = [...container.querySelectorAll('mask')].map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws OV as the same O plus a v with a notch for Ovie', () => {
    const { container } = render(
      <JovieO variant='ov' size={48} label='Ovie' />
    );
    const root = svg(container);
    expect(root.dataset.joVariant).toBe('ov');
    const [, , w, h] = (root.getAttribute('viewBox') ?? '')
      .split(' ')
      .map(Number);
    expect(w / h).toBeGreaterThan(1.8);
    expect(container.querySelectorAll('polygon')).toHaveLength(2);
  });
});
