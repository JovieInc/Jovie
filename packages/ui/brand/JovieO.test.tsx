import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoA11yViolations } from '../test-utils/a11y';
import { JovieO } from './JovieO';
import { JOVIE_O_STATES } from './jovie-o-motion';

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
    const revealedCounters = () =>
      container.querySelectorAll('mask ellipse:not(.jo-iris)').length;
    expect(revealedCounters()).toBe(1);
    rerender(<JovieO state='loading' />);
    expect(revealedCounters()).toBe(0);
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
      <JovieO variant='ov' size={48} still label='Ovie' />
    );
    const root = svg(container);
    expect(root.dataset.joVariant).toBe('ov');
    const [, , w, h] = (root.getAttribute('viewBox') ?? '')
      .split(' ')
      .map(Number);
    expect(w / h).toBeGreaterThan(1.8);
    expect(container.querySelectorAll('polygon')).toHaveLength(2);
  });

  it('uses fixed luminance tokens with standalone fallbacks for both masks', () => {
    const { container } = render(<JovieO variant='ov' still />);
    expect(container.querySelector('.jo-tail')).toHaveAttribute(
      'stroke',
      'var(--brand-mask-reveal, white)'
    );
    expect(container.querySelector('mask rect')).toHaveAttribute(
      'fill',
      'var(--brand-mask-reveal, white)'
    );
    for (const cutout of container.querySelectorAll('.jo-iris, .jo-lid')) {
      expect(cutout).toHaveAttribute(
        'fill',
        'var(--brand-mask-conceal, black)'
      );
    }
  });
});

describe.each(['jovie', 'ov'] as const)('JovieO %s accessibility', variant => {
  it.each(JOVIE_O_STATES)(
    'supports named and decorative %s marks',
    async state => {
      const { container, rerender } = render(
        <JovieO
          variant={variant}
          state={state}
          still
          label={`Jovie ${state}`}
        />
      );
      expect(svg(container)).toHaveAttribute('role', 'img');
      await expectNoA11yViolations(container);
      rerender(<JovieO variant={variant} state={state} still />);
      expect(svg(container)).toHaveAttribute('aria-hidden', 'true');
      await expectNoA11yViolations(container);
    }
  );
});
