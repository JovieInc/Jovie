import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Orbit } from './Orbit';

describe('Orbit', () => {
  it('draws one hairline per ring and a lit arc on the chosen ring', () => {
    const { container } = render(
      <Orbit id='t' rings={[1800, 1400, 1000]} arc={[282, 34]} arcRing={1} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '1840');
    expect(container.querySelectorAll('.hv3-orbit__ring')).toHaveLength(3);
    const arc = container.querySelector('.hv3-orbit__arc');
    // The arc sits on the 1400 ring: radius 700 in the path.
    expect(arc?.getAttribute('d')).toMatch(/A700 700 0 0 1/);
    expect(arc).toHaveAttribute('stroke', 'url(#t)');
    expect(container.querySelector('.hv3-orbit__light')).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('fills the ground inside the outer ring and skips the key-light blob', () => {
    const { container } = render(
      <Orbit id='g' rings={[2800]} arc={[346, 28]} ground />
    );
    const ground = container.querySelector('.hv3-orbit__ground');
    expect(ground).toHaveAttribute('r', '1400');
    expect(ground).toHaveAttribute('fill', 'url(#g-ground)');
    expect(container.querySelector('.hv3-orbit__light')).toBeNull();
    expect(container.querySelector('.hv3-orbit__arc')).not.toBeNull();
  });

  it('draws a closed ring with no lit arc and no key light', () => {
    const { container } = render(
      <Orbit id='c' rings={[760]} arc={[0, 360]} closed />
    );
    expect(container.querySelector('.hv3-orbit__closed')).not.toBeNull();
    expect(container.querySelector('.hv3-orbit__arc')).toBeNull();
    expect(container.querySelector('.hv3-orbit__light')).toBeNull();
  });
});
