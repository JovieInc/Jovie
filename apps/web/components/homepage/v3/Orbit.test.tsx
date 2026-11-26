import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Orbit } from './Orbit';

describe('Orbit', () => {
  it('draws one hairline per ring and a lit arc on the chosen ring', async () => {
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
    // Light is a hairline arc and one small point: no wash, no bloom.
    expect(container.querySelector('.hv3-orbit__point')).not.toBeNull();
    expect(container.querySelector('.hv3-orbit__light')).toBeNull();
    expect(container.querySelector('.hv3-orbit__bloom')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('takes one accent from the pack, or none to inherit the section', () => {
    const { container, rerender } = render(
      <Orbit id='a' rings={[400]} arc={[0, 30]} accent='ultra' />
    );
    expect(container.firstElementChild).toHaveAttribute('data-accent', 'ultra');
    rerender(<Orbit id='a' rings={[400]} arc={[0, 30]} />);
    expect(container.firstElementChild).not.toHaveAttribute('data-accent');
  });

  it('draws a closed ring with no lit arc and no key light', async () => {
    const { container } = render(
      <Orbit id='c' rings={[760]} arc={[0, 360]} closed />
    );
    expect(container.querySelector('.hv3-orbit__closed')).not.toBeNull();
    expect(container.querySelector('.hv3-orbit__arc')).toBeNull();
    expect(container.querySelector('.hv3-orbit__point')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
