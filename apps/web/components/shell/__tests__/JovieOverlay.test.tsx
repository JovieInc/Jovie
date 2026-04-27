import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JovieOverlay } from '../JovieOverlay';

describe('JovieOverlay', () => {
  it('renders without crashing when listening is false', () => {
    const { container } = render(<JovieOverlay listening={false} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('shows the listening copy', () => {
    render(<JovieOverlay listening={true} />);
    expect(screen.getByText('Listening')).toBeInTheDocument();
  });

  it('marks the panel as aria-hidden when not listening', () => {
    const { container } = render(<JovieOverlay listening={false} />);
    // First child is the backdrop, second is the panel container.
    const panel = container.querySelectorAll('[aria-hidden]')[1];
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the panel as aria-hidden=false when listening', () => {
    const { container } = render(<JovieOverlay listening={true} />);
    const panel = container.querySelectorAll('[aria-hidden]')[1];
    expect(panel?.getAttribute('aria-hidden')).toBe('false');
  });

  it('shows the keyboard hint', () => {
    render(<JovieOverlay listening={true} />);
    expect(screen.getByText(/hold/)).toBeInTheDocument();
  });
});
