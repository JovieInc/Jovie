import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingElectricSeam } from './MarketingElectricSeam';

const { useReducedMotion } = vi.hoisted(() => ({
  useReducedMotion: vi.fn(() => false),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({ useReducedMotion }));

describe('MarketingElectricSeam certificate', () => {
  beforeEach(() => {
    useReducedMotion.mockReturnValue(false);
  });

  it('renders the decorative seam with its traveling spark', async () => {
    const { container } = render(
      <MarketingElectricSeam idSeed='home seam!' className='mt-4' />
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
      <MarketingElectricSeam idSeed='static' spark={false} />
    );
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      0
    );
    expect(container.querySelector('[data-seam-glow]')).not.toBeNull();
    await expectNoA11yViolations(container);

    useReducedMotion.mockReturnValue(true);
    rerender(<MarketingElectricSeam idSeed='static' />);
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(
      0
    );
    await expectNoA11yViolations(container);
  });
});
