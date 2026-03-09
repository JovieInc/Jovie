import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JovieIcon } from '@/components/atoms/JovieIcon';

describe('JovieIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<JovieIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('SVG has aria-hidden="true"', () => {
    const { container } = render(<JovieIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with default size=24', () => {
    const { container } = render(<JovieIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('renders with custom size', () => {
    const { container } = render(<JovieIcon size={32} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('passes className to SVG', () => {
    const { container } = render(<JovieIcon className='my-icon' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('my-icon');
  });
});
