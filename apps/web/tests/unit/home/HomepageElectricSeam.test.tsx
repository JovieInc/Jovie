import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageElectricSeam } from '@/components/homepage/HomepageElectricSeam';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

const { useReducedMotion } = await import('@/lib/hooks/useReducedMotion');

describe('HomepageElectricSeam', () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('renders the decorative seam with traveling spark paths by default', () => {
    const { getByTestId, container } = render(<HomepageElectricSeam />);

    expect(getByTestId('homepage-electric-seam')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      2
    );
  });

  it('omits traveling spark paths when spark is false', () => {
    const { container } = render(<HomepageElectricSeam spark={false} />);

    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      0
    );
    expect(container.querySelector('[data-seam-glow]')).not.toBeNull();
  });

  it('renders only the static final glow under reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { container } = render(<HomepageElectricSeam />);

    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      0
    );
    expect(container.querySelector('[data-seam-glow]')).not.toBeNull();
    expect(container.querySelector('style')).toBeNull();
  });

  it('plays the spark animation exactly once with the cinematic seam duration', () => {
    const { container } = render(<HomepageElectricSeam />);

    for (const path of container.querySelectorAll('path[stroke-dasharray]')) {
      expect(path.getAttribute('style')).toContain(
        'animation-iteration-count: 1'
      );
      expect(path.getAttribute('style')).toContain(
        'animation-duration: calc(var(--ds-motion-cinematic-duration) * 1.5)'
      );
    }
  });

  it('uses a stable caller-provided id seed for filters and keyframes', () => {
    const { container } = render(<HomepageElectricSeam idSeed='stable-seam' />);

    expect(container.querySelector('filter')?.getAttribute('id')).toBe(
      'homepage-electric-seam-spark-stable-seam'
    );
    expect(container.querySelector('style')?.textContent).toContain(
      'homepage-electric-seam-travel-stable-seam'
    );
    expect(
      container.querySelector('path[stroke-dasharray]')?.getAttribute('filter')
    ).toBe('url(#homepage-electric-seam-spark-stable-seam)');
  });
});
