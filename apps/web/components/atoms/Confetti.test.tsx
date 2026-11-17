import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CONFETTI_PARTICLE_CLASS,
  ConfettiOverlay,
  generateParticles,
} from './Confetti';

const particlesIn = (container: HTMLElement) =>
  container.querySelectorAll(`.${CONFETTI_PARTICLE_CLASS}`);

describe('Confetti', () => {
  it('paints the default burst inside a hidden, click-through frame', async () => {
    const { container } = render(
      <div className='relative'>
        <ConfettiOverlay />
      </div>
    );

    const frame = container.querySelector('[aria-hidden="true"]');
    expect(frame).toHaveClass('pointer-events-none', 'absolute', 'inset-0');
    expect(particlesIn(container)).toHaveLength(40);
    expect(container.querySelector('style')?.textContent).toContain(
      '@keyframes confetti-fall'
    );
    await expectNoA11yViolations(container);
  });

  it('paints no particles for a zero count and pins to the viewport on request', async () => {
    const { container } = render(<ConfettiOverlay count={0} viewport />);

    expect(particlesIn(container)).toHaveLength(0);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(
      'fixed'
    );
    await expectNoA11yViolations(container);
  });

  it('cycles a custom palette and keeps a dense burst deterministic', async () => {
    const colors = ['var(--color-accent)', 'var(--color-success)'];
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ConfettiOverlay count={160} colors={colors} />
      </div>
    );

    const particles = Array.from(particlesIn(container)) as HTMLElement[];
    expect(particles).toHaveLength(160);
    expect(particles[0].style.backgroundColor).toBe('var(--color-accent)');
    expect(particles[1].style.backgroundColor).toBe('var(--color-success)');
    expect(generateParticles(3, colors)).toEqual(generateParticles(3, colors));
    await expectNoA11yViolations(container);
  });
});
