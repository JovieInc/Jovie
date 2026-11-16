import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageElectricSeam } from './HomepageElectricSeam';

const { useReducedMotion } = vi.hoisted(() => ({
  useReducedMotion: vi.fn(() => false),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({ useReducedMotion }));

describe('HomepageElectricSeam certificate', () => {
  beforeEach(() => {
    useReducedMotion.mockReturnValue(false);
  });

  it('re-exports the decorative marketing seam with its traveling spark', async () => {
    const { container } = render(
      <HomepageElectricSeam idSeed='home seam!' className='mt-4' />
    );

    const seam = screen.getByTestId('homepage-electric-seam');
    expect(seam).toHaveAttribute('aria-hidden', 'true');
    expect(seam).toHaveClass('block', 'mt-4');
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      2
    );
    expect(
      container.querySelector('#homepage-electric-seam-glow-homeseam')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps only the static glow when the spark is off or motion is reduced', async () => {
    const { container, rerender } = render(
      <HomepageElectricSeam idSeed='static' spark={false} />
    );
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      0
    );
    expect(container.querySelector('[data-seam-glow]')).not.toBeNull();
    await expectNoA11yViolations(container);

    useReducedMotion.mockReturnValue(true);
    rerender(<HomepageElectricSeam idSeed='static' />);
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      0
    );
    await expectNoA11yViolations(container);
  });
});
