import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayGlyph } from './PlayGlyph';

describe('PlayGlyph', () => {
  it('owns the 1px optical offset', () => {
    const { container } = render(<PlayGlyph />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('h-3.5', 'w-3.5', 'translate-x-px');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    [12, ['h-3', 'w-3']],
    [14, ['h-3.5', 'w-3.5']],
    [16, ['h-4', 'w-4']],
  ] as const)('sizes %spx with %s', (size, classes) => {
    const { container } = render(<PlayGlyph size={size} />);
    expect(container.querySelector('svg')).toHaveClass(...classes);
  });

  it('passes className, strokeWidth and fill through', () => {
    const { container } = render(
      <PlayGlyph
        size={12}
        className='text-tooltip-foreground'
        strokeWidth={2.5}
        fill='currentColor'
      />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('text-tooltip-foreground', 'translate-x-px');
    expect(svg).toHaveAttribute('stroke-width', '2.5');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });
});
