import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CONFETTI_PARTICLE_CLASS,
  ConfettiOverlay,
  generateParticles,
} from '@/components/atoms/Confetti';

describe('generateParticles', () => {
  it('returns 40 particles by default', () => {
    const particles = generateParticles();
    expect(particles).toHaveLength(40);
  });

  it('returns the requested count of particles', () => {
    const particles = generateParticles(10);
    expect(particles).toHaveLength(10);
  });

  it('assigns sequential ids', () => {
    const particles = generateParticles(3);
    expect(particles.map(p => p.id)).toEqual([
      'confetti-0',
      'confetti-1',
      'confetti-2',
    ]);
  });

  it('cycles colors through the list', () => {
    const colors = ['red', 'blue'];
    const particles = generateParticles(4, colors);
    expect(particles[0].color).toBe('red');
    expect(particles[1].color).toBe('blue');
    expect(particles[2].color).toBe('red');
    expect(particles[3].color).toBe('blue');
  });

  it('particles have expected CSS-related properties', () => {
    const particles = generateParticles(1);
    const p = particles[0];
    expect(p.width).toBeGreaterThanOrEqual(4);
    expect(p.height).toBeGreaterThanOrEqual(4);
    expect(p.left).toMatch(/%$/);
    expect(p.opacity).toBe(0.9);
    expect(p.animationDelay).toMatch(/s$/);
    expect(p.animationDuration).toMatch(/s$/);
    expect(p.rotation).toMatch(/^rotate\(.+deg\)$/);
  });
});

describe('ConfettiOverlay', () => {
  it('renders particle spans and a style tag', () => {
    const { container } = render(<ConfettiOverlay count={5} />);

    const spans = container.querySelectorAll(`.${CONFETTI_PARTICLE_CLASS}`);
    expect(spans).toHaveLength(5);

    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.textContent).toContain('confetti-fall');
  });

  it('particles have expected inline styles', () => {
    const { container } = render(<ConfettiOverlay count={1} />);
    const span = container.querySelector(
      `.${CONFETTI_PARTICLE_CLASS}`
    ) as HTMLElement;

    expect(span.style.backgroundColor).toBeTruthy();
    expect(span.style.animationDelay).toBeTruthy();
    expect(span.style.animationDuration).toBeTruthy();
    expect(span.style.left).toBeTruthy();
  });
});
