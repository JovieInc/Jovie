import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JovieMarkElectric } from './JovieMarkElectric';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

const { useReducedMotion } = await import('@/lib/hooks/useReducedMotion');

describe('JovieMarkElectric', () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('renders the canonical Jovie mark SVG', () => {
    const { container } = render(<JovieMarkElectric />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 353.68 347.97');
  });

  it('is decorative — aria-hidden on the wrapper', () => {
    const { container } = render(<JovieMarkElectric />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the spark paths by default', () => {
    const { container } = render(<JovieMarkElectric />);
    const paths = container.querySelectorAll('path[stroke-dasharray]');
    expect(paths.length).toBe(2);
  });

  it('omits the spark paths when spark is false', () => {
    const { container } = render(<JovieMarkElectric spark={false} />);
    const paths = container.querySelectorAll('path[stroke-dasharray]');
    expect(paths.length).toBe(0);
  });

  it('omits the spark paths under prefers-reduced-motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { container } = render(<JovieMarkElectric />);
    const paths = container.querySelectorAll('path[stroke-dasharray]');
    expect(paths.length).toBe(0);
  });
});
