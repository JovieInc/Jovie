import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JovieMark } from '../JovieMark';

describe('JovieMark', () => {
  it('renders an inline SVG with the Jovie title', () => {
    const { container } = render(<JovieMark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(screen.getByTitle('Jovie')).toBeInTheDocument();
  });

  it('forwards className to the svg element', () => {
    const { container } = render(<JovieMark className='h-12 w-12 custom' />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('custom');
  });

  it('is hidden from assistive tech by default', () => {
    const { container } = render(<JovieMark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
