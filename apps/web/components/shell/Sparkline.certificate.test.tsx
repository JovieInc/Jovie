import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Sparkline } from './Sparkline';

function sizeChart(svg: SVGSVGElement) {
  svg.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 340,
      height: 120,
      right: 340,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('Sparkline certificate', () => {
  it('reports the hovered index and clears it on leave, axe-clean', async () => {
    const onHover = vi.fn();
    const { container } = render(
      <Sparkline points={[1, 2, 3, 4, 5]} trend='up' onHover={onHover} />
    );
    const svg = screen.getByRole('img', { name: 'Trend over time' });
    sizeChart(svg as unknown as SVGSVGElement);
    fireEvent.mouseMove(svg, { clientX: 340, clientY: 10 });
    expect(onHover).toHaveBeenLastCalledWith(4);
    fireEvent.mouseMove(svg, { clientX: 0, clientY: 10 });
    expect(onHover).toHaveBeenLastCalledWith(0);
    fireEvent.mouseLeave(svg);
    expect(onHover).toHaveBeenLastCalledWith(null);
    await expectNoA11yViolations(container);
  });

  it('keeps an empty chart labelled and draws no playhead', async () => {
    const { container } = render(
      <Sparkline
        points={[]}
        trend='flat'
        ariaLabel='No clicks yet'
        hoverIdx={0}
      />
    );
    expect(
      screen.getByRole('img', { name: 'No clicks yet' })
    ).toBeInTheDocument();
    expect(container.querySelector('circle')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('centres a single point and marks it on hover', async () => {
    const { container } = render(
      <Sparkline points={[9]} trend='flat' hoverIdx={0} />
    );
    expect(container.querySelector('circle')).toHaveAttribute('cx', '170');
    await expectNoA11yViolations(container);
  });

  it('keeps a year of points and an RTL label axe-clean', async () => {
    const points = Array.from({ length: 365 }, (_, i) => i % 40);
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Sparkline points={points} trend='down' ariaLabel='النقرات عبر الزمن' />
      </div>
    );
    const svg = screen.getByRole('img', { name: 'النقرات عبر الزمن' });
    expect(
      svg.querySelectorAll('path')[1]?.getAttribute('d')?.split('L')
    ).toHaveLength(365);
    await expectNoA11yViolations(container);
  });
});
