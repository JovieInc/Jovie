import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an SVG with the supplied aria-label', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} trend='up' ariaLabel='Test chart' />
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('Test chart');
  });

  it('uses the up palette for an up trend', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} trend='up' />);
    const lines = container.querySelectorAll('path');
    // Second path is the line stroke
    expect(lines[1]?.getAttribute('stroke')).toBe('var(--color-success-text)');
  });

  it('uses the down palette for a down trend', () => {
    const { container } = render(<Sparkline points={[3, 2, 1]} trend='down' />);
    const lines = container.querySelectorAll('path');
    expect(lines[1]?.getAttribute('stroke')).toBe('var(--color-error-text)');
  });

  it('flips tone by polarity: a rising lower-is-better metric is bad news', () => {
    const stroke = (polarity?: 'lower-is-better') =>
      render(<Sparkline points={[1, 2, 3]} trend='up' polarity={polarity} />)
        .container.querySelectorAll('path')[1]
        ?.getAttribute('stroke');

    expect(stroke('lower-is-better')).toBe('var(--color-error-text)');
    expect(stroke()).toBe('var(--color-success-text)');
  });

  it('never strokes with the neon accent fills, which fail 3:1 on white', () => {
    for (const trend of ['up', 'down'] as const) {
      const { container, unmount } = render(
        <Sparkline points={[1, 2, 3]} trend={trend} />
      );
      for (const path of container.querySelectorAll('path')) {
        expect(path.outerHTML).not.toMatch(/--color-accent-(green|red)/);
      }
      unmount();
    }
  });

  it('renders a playhead when hoverIdx is provided', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} trend='up' hoverIdx={1} />
    );
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('line')).not.toBeNull();
  });

  it('omits the playhead when hoverIdx is null', () => {
    const { container } = render(
      <Sparkline points={[1, 2, 3]} trend='up' hoverIdx={null} />
    );
    expect(container.querySelector('circle')).toBeNull();
    expect(container.querySelector('line')).toBeNull();
  });

  it('fires onHover with null on mouse leave', () => {
    const onHover = vi.fn();
    const { container } = render(
      <Sparkline points={[1, 2, 3]} trend='up' onHover={onHover} />
    );
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg missing');
    fireEvent.mouseLeave(svg);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('paints only from design tokens so it reads in light and dark', () => {
    const { container } = render(
      <Sparkline points={[2, 1, 2]} trend='flat' hoverIdx={1} />
    );
    const painted = [...container.querySelectorAll('path, line, circle')]
      .flatMap(node => [node.getAttribute('fill'), node.getAttribute('stroke')])
      .filter((value): value is string => Boolean(value) && value !== 'none');

    expect(painted.length).toBeGreaterThan(0);
    for (const value of painted) {
      expect(value).not.toMatch(/rgba?\(|#[0-9a-f]{3,8}/i);
      expect(value).toMatch(/var\(--/);
    }
  });

  it('pulse variant draws a line without an area fill track', () => {
    const { container } = render(
      <Sparkline points={[1, 3, 2]} trend='up' variant='pulse' />
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('data-sparkline-variant')).toBe('pulse');
    expect(paths[0]?.getAttribute('fill')).toBe('none');
  });
});

describe('Sparkline observations', () => {
  it('keeps missing periods as gaps in both the line and the area', () => {
    const { container } = render(
      <Sparkline points={[4, 0, null, 2, 1]} trend='down' hoverIdx={2} />
    );
    const paths = container.querySelectorAll('path');
    expect(paths[1]?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')?.match(/Z/g)).toHaveLength(2);
    expect(container.querySelector('line')).toBeNull();
    expect(container.querySelector('svg')).toHaveAccessibleDescription(
      '4 measured, 1 missing. Minimum 0, maximum 4.'
    );
  });

  it('marks an isolated observation at its raw period and omits all missing marks', () => {
    const { container, rerender } = render(
      <Sparkline points={[null, 0, null]} trend='flat' />
    );
    const mark = container.querySelector('[data-sparkline-variant]');
    expect(mark?.getAttribute('d')).toContain('M 170.0 120.0 l 0 0');
    rerender(<Sparkline points={[null, Number.NaN, Infinity]} trend='flat' />);
    expect(container.querySelector('path, circle, line')).toBeNull();
    expect(container.querySelector('svg')).toHaveAccessibleDescription(
      'No measurements. 3 missing.'
    );
  });

  it('closes signed areas at the zero line with finite SVG coordinates', () => {
    const { container } = render(
      <Sparkline points={[-Number.MAX_VALUE, 0, Number.MAX_VALUE]} trend='up' />
    );
    const area = container.querySelector('path')?.getAttribute('d');
    expect(area).toBe(
      'M 0.0 120.0 L 170.0 60.0 L 340.0 0.0 L 340.0 60.0 L 0.0 60.0 Z'
    );
  });

  it('keeps a gap even when it falls within one sampling column', () => {
    const points = Array<number | null>(10_001).fill(5);
    points[12] = null;
    const { container } = render(<Sparkline points={points} trend='flat' />);
    const path = container
      .querySelector('[data-sparkline-variant]')
      ?.getAttribute('d');
    expect(path).toContain('L 0.4 0.0 M 0.4 0.0');
    expect(container.querySelector('svg')).toHaveAccessibleDescription(
      /10000 measured, 1 missing. Minimum 5, maximum 5./
    );
  });

  it.each([100_000, 150_001])(
    'bounds fragmented series with %i raw periods using independent observations',
    n => {
      const points: (number | null)[] = Array.from({ length: n }, (_, index) =>
        index % 2 === 0 ? 0 : null
      );
      points[4] = 99;
      points[6] = -99;
      const { container } = render(
        <Sparkline points={points} trend='flat' hoverIdx={8} />
      );
      const paths = container.querySelectorAll('path');
      expect(paths).toHaveLength(1);
      const marks = paths[0]?.getAttribute('d') ?? '';
      expect(marks.match(/M/g)?.length).toBeLessThanOrEqual(4 * 341);
      expect(marks).not.toContain('L');
      expect(marks).toMatch(/M [\d.]+ 0.0 l 0 0 M [\d.]+ 120.0 l 0 0/);
      expect(container.querySelector('svg')).toHaveAccessibleDescription(
        /Dots show/
      );
      expect(
        Number(container.querySelector('circle')?.getAttribute('cy'))
      ).toBe(60);
    }
  );

  it('bounds dense path size and keeps opposite extrema in their original order', () => {
    const points = Array<number>(150_001).fill(0);
    points[4] = 99;
    points[5] = -99;
    points[6] = 2;
    const { container } = render(
      <Sparkline points={points} trend='up' hoverIdx={6} />
    );
    const path = container
      .querySelector('[data-sparkline-variant]')
      ?.getAttribute('d');
    expect(path).toBeDefined();
    expect(path?.match(/[ML]/g)?.length).toBeLessThanOrEqual(4 * 341);
    expect(path).toMatch(/^M 0\.0 60\.0 L 0\.0 0\.0 L 0\.0 120\.0 /);
    expect(path).toMatch(/L 340\.0 60\.0$/);
    // The sample discards index 6, but the playhead reads the original value.
    const selected = container.querySelector('circle');
    expect(Number(selected?.getAttribute('cy'))).toBeCloseTo(58.787878);
  });
});
