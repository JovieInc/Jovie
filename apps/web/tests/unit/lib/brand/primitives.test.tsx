import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  JOVIE_PATH,
  JOVIE_VIEWBOX,
  LETTER_PAIRS,
  LETTER_PATHS,
  LETTER_SEQUENCE,
  Lockup,
  Mark,
  WORDMARK_TOTAL_WIDTH_U,
  WORDMARK_TRACK,
  Wordmark,
} from '@/lib/brand';

describe('JOVIE_PATH (drift guard)', () => {
  it('has the canonical viewBox dimensions', () => {
    expect(JOVIE_VIEWBOX).toEqual({ width: 360, height: 360 });
  });

  it('matches the canonical path constant — length and endpoints', () => {
    // Drift guard: if anyone "improves" the mark path, this fails loudly so
    // we can decide whether the change is intentional and propagate it through
    // every consumer (favicons, OG image, JSON-LD, desktop icon).
    expect(JOVIE_PATH.length).toBe(1043);
    expect(JOVIE_PATH.startsWith('M179.16,6 L182.24,6.05')).toBe(true);
    expect(JOVIE_PATH.endsWith('C86.18,25.47 130.38,6 179.16,6 Z')).toBe(true);
  });
});

describe('Mark', () => {
  it('renders an svg with the canonical viewBox and path', () => {
    const { container } = render(<Mark size={120} color='#F5F4F0' />);
    const svg = container.querySelector('svg');
    const path = container.querySelector('path');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 360 360');
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
  it('renders five letter glyphs by default', () => {
    const { container } = render(<Wordmark height={64} color='#08090a' />);
    const paths = container.querySelectorAll('svg > path');
    expect(paths.length).toBe(LETTER_SEQUENCE.length);
  });

  it('substitutes the mark glyph for the O when markAsO is true', () => {
    const plain = render(<Wordmark height={64} markAsO={false} />);
    const integrated = render(<Wordmark height={64} markAsO />);
    const plainPaths = plain.container.querySelectorAll('svg > path').length;
    const integratedPaths =
      integrated.container.querySelectorAll('svg > path').length;
    const integratedGroups =
      integrated.container.querySelectorAll('svg > g').length;
    // Plain wordmark renders 5 top-level letter paths.
    expect(plainPaths).toBe(5);
    // markAsO replaces the O path with a <g> wrapping the mark path, so we
    // expect 4 top-level paths + 1 group.
    expect(integratedPaths).toBe(4);
    expect(integratedGroups).toBe(1);
  });

  it('has the canonical total width — drift guard for letter kerning', () => {
    // J(66) + JO(12) + O(100) + OV(12) + V(76) + VI(8) + I(22) + IE(14) + E(64)
    expect(WORDMARK_TOTAL_WIDTH_U).toBe(374);
  });

  it('respects per-pair tracking constants', () => {
    expect(WORDMARK_TRACK.JO).toBe(12);
    expect(WORDMARK_TRACK.OV).toBe(12);
    expect(WORDMARK_TRACK.VI).toBe(8);
    expect(WORDMARK_TRACK.IE).toBe(14);
  });

  it('letter widths and pair labels match the canonical sequence', () => {
    expect(LETTER_SEQUENCE).toEqual(['J', 'O', 'V', 'I', 'E']);
    expect(LETTER_PAIRS).toEqual(['JO', 'OV', 'VI', 'IE']);
    expect(LETTER_PATHS.J.w).toBe(66);
    expect(LETTER_PATHS.O.w).toBe(100);
    expect(LETTER_PATHS.O.rule).toBe('evenodd');
    expect(LETTER_PATHS.V.w).toBe(76);
    expect(LETTER_PATHS.I.w).toBe(22);
    expect(LETTER_PATHS.E.w).toBe(64);
  });
});

describe('Lockup', () => {
  it('renders horizontal mark + wordmark by default', () => {
    const { container } = render(<Lockup height={48} color='#F5F4F0' />);
    const svgs = container.querySelectorAll('svg');
    // One Mark svg + one Wordmark svg = 2 top-level svgs.
    expect(svgs.length).toBe(2);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.flexDirection).toBe('');
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
