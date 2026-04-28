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
    expect(lines[1]?.getAttribute('stroke')).toContain('165,243,252');
  });

  it('uses the down palette for a down trend', () => {
    const { container } = render(<Sparkline points={[3, 2, 1]} trend='down' />);
    const lines = container.querySelectorAll('path');
    expect(lines[1]?.getAttribute('stroke')).toContain('253,164,175');
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
});
