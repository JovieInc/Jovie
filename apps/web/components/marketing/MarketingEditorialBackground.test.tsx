import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARKETING_EDITORIAL_BACKGROUND_VARIANTS,
  MarketingEditorialBackground,
} from './MarketingEditorialBackground';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

const { useReducedMotion } = await import('@/lib/hooks/useReducedMotion');

function readComponentCss(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      'components/marketing/MarketingEditorialBackground.css'
    ),
    'utf8'
  );
}

describe('MarketingEditorialBackground — shared editorial background system (JOV-6249)', () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('renders the soft variant as the quiet static field with no motion parts', () => {
    const { container, getByTestId } = render(
      <MarketingEditorialBackground variant='soft' />
    );

    const root = getByTestId('marketing-editorial-background-soft');
    expect(root).toHaveAttribute('data-variant', 'soft');
    expect(
      getByTestId('marketing-editorial-background-field-soft')
    ).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.meb__light-well')).toBeInTheDocument();
    expect(container.querySelector('.meb__bloom')).not.toBeInTheDocument();
    expect(container.querySelector('.meb__seam')).not.toBeInTheDocument();
    expect(container.querySelector('style')).not.toBeInTheDocument();
    expect(root.querySelectorAll('img, video, canvas')).toHaveLength(0);
  });

  it('renders the flowing variant as one dominant sweep: bloom B behind the electric seam', () => {
    const { container, getByTestId } = render(
      <MarketingEditorialBackground variant='flowing' idSeed='flow-test' />
    );

    const root = getByTestId('marketing-editorial-background-flowing');
    expect(root).toHaveAttribute('data-variant', 'flowing');
    expect(
      getByTestId('marketing-editorial-background-field-flowing')
    ).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.meb__bloom')).toBeInTheDocument();
    expect(container.querySelector('.meb__light-well')).not.toBeInTheDocument();

    // The sweep rides the existing electric seam primitive, one direction.
    const seam = getByTestId('homepage-electric-seam');
    expect(seam.parentElement).toHaveClass('meb__seam');
    expect(container.querySelector('filter')?.getAttribute('id')).toBe(
      'homepage-electric-seam-spark-flow-test'
    );
  });

  it('renders children on the content layer above the decorative field', () => {
    render(
      <MarketingEditorialBackground variant='soft'>
        <p>Receiving content</p>
      </MarketingEditorialBackground>
    );

    const content = screen
      .getByText('Receiving content')
      .closest('[data-meb-layer="content"]');
    expect(content).toHaveClass('meb__content');
    // The field stays decorative; content is the only exposed layer.
    expect(document.querySelector('.meb__field')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('throws on an unknown variant instead of inventing taste', () => {
    expect(() =>
      render(
        <MarketingEditorialBackground variant={'crystal-ribbon' as 'soft'} />
      )
    ).toThrowError(/unknown variant "crystal-ribbon"/);
  });

  it('keeps the locked field values in the stylesheet (source-bound contract)', () => {
    const css = readComponentCss();

    // Soft variant mirrors the homepage light well exactly (home.css).
    expect(css).toContain('top: 48%');
    expect(css).toContain('width: min(80rem, 120vw)');
    expect(css).toContain('height: min(42rem, 62vw)');
    expect(css).toContain('opacity: 0.5');
    expect(css).toContain('filter: blur(var(--space-8))');
    expect(css).toContain('inset: 42% 14% auto');
    expect(css).toContain('filter: blur(var(--space-12))');
    expect(css).toContain(
      'color-mix(in oklab, var(--system-b-text-primary) 1.5%, transparent)'
    );
    expect(css).toContain('width: 150vw');
    expect(css).toContain('height: 60vw');

    // Flowing variant mirrors soft optical bloom B exactly (JOV-6246).
    expect(css).toContain('inset: -18% 8% auto');
    expect(css).toContain('height: 52%');
    expect(css).toContain('var(--radius-pill)');
    expect(css).toContain('var(--color-accent-blue-subtle)');
    expect(css).toContain('filter: blur(80px)');
    expect(css).toContain('opacity: 0.42');

    // Shared canvas + layered stacking: content above the field.
    expect(css).toContain('background: var(--system-b-bg-page)');
  });

  it('exposes exactly the two approved variants', () => {
    expect(MARKETING_EDITORIAL_BACKGROUND_VARIANTS).toEqual([
      'soft',
      'flowing',
    ]);
  });
});
