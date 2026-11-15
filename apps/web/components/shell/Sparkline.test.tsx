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
});
