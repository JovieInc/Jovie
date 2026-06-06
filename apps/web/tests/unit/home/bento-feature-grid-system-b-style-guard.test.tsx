import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BentoFeatureGrid } from '@/features/home/BentoFeatureGrid';

const webRoot = path.resolve(__dirname, '../../..');
const bentoSourcePath = 'components/features/home/BentoFeatureGrid.tsx';
const curveSourcePath = 'components/features/home/MomentumCurves.tsx';
const cssPath = 'styles/design-system.css';

const forbiddenSourcePatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /(?:linear|radial)-gradient|<linearGradient/,
  /\b(?:bg|border|text|ring|shadow|rounded|h|w|max-w|min-h|tracking|leading|px|py|pt|pb)-\[(?!var\()[^\]]+\]/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white|blue)-(?:[0-9]|\[|\/)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner|none|\[)/,
  /\b(?:transition-all|transition-transform|hover:brightness|active:scale|hover:-translate|group-hover:scale)\b/,
] as const;

const forbiddenCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /(?:linear|radial)-gradient/,
  /box-shadow:/,
  /letter-spacing:\s*-[^;]+/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractBentoCss(source: string): string {
  const start = source.indexOf('SYSTEM B HOME BENTO FEATURE GRID PRIMITIVES');
  const end = source.indexOf(
    'SYSTEM B HOME BENTO FEATURE GRID PRIMITIVES END',
    start
  );

  expect(start, 'bento CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'bento CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('BentoFeatureGrid System B source contract', () => {
  it('keeps bento card markup and curves on named System B primitives', () => {
    const sources = [
      readFileSync(path.join(webRoot, bentoSourcePath), 'utf8'),
      readFileSync(path.join(webRoot, curveSourcePath), 'utf8'),
    ];

    for (const source of sources) {
      for (const pattern of forbiddenSourcePatterns) {
        expect(source, `bento source leaked ${pattern}`).not.toMatch(pattern);
      }
    }

    const bentoSource = sources[0];
    expect(bentoSource).toContain('system-b-home-bento-card');
    expect(bentoSource).toContain('data-tone={tone}');
    expect(bentoSource).toContain('text-accent');
    expect(bentoSource).toContain('text-info');
    expect(bentoSource).toContain('text-success');
    expect(bentoSource).not.toContain('GLOW_CLASSES');
    expect(bentoSource).not.toContain('glowTone');
  });

  it('keeps bento CSS tokenized, flat, and gradient-free', () => {
    const css = extractBentoCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--color-accent)');
    expect(css).toContain('var(--color-info)');
    expect(css).toContain('var(--color-success)');
    expect(css).toMatch(
      /:where\(\.system-b-home-bento-curve-line\)\s*{[^}]*fill:\s*none;/
    );
  });

  it('renders stable card primitives and semantic tones', () => {
    const { container } = render(<BentoFeatureGrid />);

    expect(
      screen.getByRole('heading', {
        name: 'A command center for your career.',
      })
    ).toBeInTheDocument();

    const cards = container.querySelectorAll('.system-b-home-bento-card');
    expect(cards).toHaveLength(4);
    expect(
      container.querySelector('.system-b-home-bento-card[data-tone="action"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.system-b-home-bento-card[data-tone="success"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-home-bento-card[data-tone="notification"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector('.system-b-home-bento-card[data-tone="trend"]')
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('.system-b-home-bento-curve')
    ).toHaveLength(2);
  });
});
