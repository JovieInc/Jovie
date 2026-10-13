import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JovieWordmark } from './JovieWordmark';

describe('JovieWordmark', () => {
  it('collapses to the O and opens back to the word', () => {
    const { container, rerender } = render(<JovieWordmark height={32} />);
    const box = container.firstElementChild as HTMLElement;
    const open = Number.parseFloat(box.style.width);
    expect(box.getAttribute('aria-label')).toBe('Jovie');
    rerender(<JovieWordmark height={32} collapsed />);
    const shut = Number.parseFloat(box.style.width);
    expect(box.dataset.collapsed).toBe('true');
    // the O alone: one x-height-plus-overshoot square, scaled to the box
    expect(shut).toBeLessThan(open / 3);
    expect(
      container.querySelector<SVGGElement>('[data-glyph="J"]')?.style.opacity
    ).toBe('0');
    rerender(<JovieWordmark height={32} />);
    expect(Number.parseFloat(box.style.width)).toBeCloseTo(open, 3);
  });

  it('switches to the Text master below 24 px', () => {
    const { container } = render(<JovieWordmark height={16} />);
    const o = container.querySelector('[data-glyph="o"] svg');
    // text master seam is wider than display (46 u vs 16 u)
    const seam = Number(
      o?.querySelector('mask path[stroke="#000"]')?.getAttribute('stroke-width')
    );
    expect(seam).toBeGreaterThan(5);
  });
});
