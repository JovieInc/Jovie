import { JOVIE_BRAND_GEOMETRY } from '@jovie/ui/brand/geometry.gen';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  JOVIE_PATH,
  JOVIE_VIEWBOX,
  Lockup,
  Mark,
  WORDMARK_ASPECT,
  Wordmark,
} from '@/lib/brand';

describe('JOVIE_PATH', () => {
  it('is the display master of the construction (packages/brand)', () => {
    expect(JOVIE_VIEWBOX).toEqual({ width: 100, height: 100 });
    expect(JOVIE_PATH).toBe(JOVIE_BRAND_GEOMETRY.o.display.mark);
  });
});

describe('Mark', () => {
  it('renders an svg with the canonical viewBox and path', () => {
    const { container } = render(<Mark size={120} color='#F5F4F0' />);
    const svg = container.querySelector('svg');
    const path = container.querySelector('path');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(svg?.getAttribute('width')).toBe('120');
    expect(path?.getAttribute('d')).toBe(JOVIE_PATH);
    expect(path?.getAttribute('fill')).toBe('#F5F4F0');
  });

  it('defaults to currentColor when no color is passed', () => {
    const { container } = render(<Mark size={50} />);
    expect(container.querySelector('path')?.getAttribute('fill')).toBe(
      'currentColor'
    );
  });

  it('renders an accessible label when title is provided', () => {
    const { container } = render(<Mark size={50} title='Jovie mark' />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Jovie mark');
    expect(container.querySelector('title')?.textContent).toBe('Jovie mark');
  });
});

describe('Wordmark', () => {
  it('renders the five construction glyphs, the o being the mark', () => {
    const { container } = render(<Wordmark height={64} color='#08090a' />);
    const paths = container.querySelectorAll('svg > path');
    const glyphs = JOVIE_BRAND_GEOMETRY.wordmark.display.glyphs;
    expect(paths).toHaveLength(5);
    expect([...paths].map(p => p.getAttribute('d'))).toEqual(
      glyphs.map(g => g.d)
    );
    const [, , w, h] = JOVIE_BRAND_GEOMETRY.wordmark.display.viewBox;
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `0 0 ${w} ${h}`
    );
  });

  it('sizes width from the construction aspect ratio', () => {
    const { container } = render(<Wordmark height={40} />);
    const width = Number(container.querySelector('svg')?.getAttribute('width'));
    expect(width).toBeCloseTo(40 * WORDMARK_ASPECT, 3);
  });

  it('switches to the Text master below 24 px', () => {
    const { container } = render(<Wordmark height={16} />);
    const [, , w, h] = JOVIE_BRAND_GEOMETRY.wordmark.text.viewBox;
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `0 0 ${w} ${h}`
    );
  });

  it('is labelled only when titled', () => {
    const plain = render(<Wordmark height={24} />);
    expect(
      plain.container.querySelector('svg')?.getAttribute('aria-hidden')
    ).toBe('true');
    const titled = render(<Wordmark height={24} title='Jovie' />);
    expect(titled.container.querySelector('svg')?.getAttribute('role')).toBe(
      'img'
    );
  });
});

describe('Lockup', () => {
  it('is the wordmark alone when horizontal (its o is the mark)', () => {
    const { container } = render(<Lockup height={48} color='#F5F4F0' />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('svg > path')).toHaveLength(5);
  });

  it('stacks the mark above the wordmark when stacked is true', () => {
    const { container } = render(<Lockup height={48} stacked />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.flexDirection).toBe('column');
  });

  it('exposes an accessible label', () => {
    const { container } = render(<Lockup height={32} title='Jovie' />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('img');
    expect(root.getAttribute('aria-label')).toBe('Jovie');
  });
});
