import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseOperatingSystemShowcase } from '@/features/home/ReleaseOperatingSystemShowcase';

vi.mock('@/features/home/AiDemo', () => ({
  AiDemo: () => <div data-testid='ai-demo'>ai demo</div>,
}));

vi.mock('@/features/home/HomepageLabelLogoMark', () => ({
  HomepageLabelLogoMark: ({ partner }: { partner: string }) => (
    <div data-testid={`label-logo-${partner}`}>{partner}</div>
  ),
}));

vi.mock('@/components/marketing/MarketingSurfaceCard', () => ({
  MarketingSurfaceCard: () => (
    <div data-testid='operating-system-task-surface'>tasks</div>
  ),
}));

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath =
  'components/features/home/ReleaseOperatingSystemShowcase.tsx';
const cssPath = 'styles/design-system.css';

const forbiddenSourceVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|text|ring|shadow|rounded|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white|blue)-(?:[0-9]|\[|\/)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner|none|\[)/,
  /\b(?:transition-all|transition-transform|hover:brightness|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b/,
  /\b(?:space-y|lg:hidden|lg:block|absolute|relative|pointer-events-none)\b/,
] as const;

const forbiddenShowcaseCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /letter-spacing:\s*-[^;]+/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractReleaseOperatingSystemShowcaseCss(source: string): string {
  const start = source.indexOf(
    'SYSTEM B HOME RELEASE OPERATING SYSTEM SHOWCASE PRIMITIVES'
  );
  const end = source.indexOf(
    'SYSTEM B HOME RELEASE OPERATING SYSTEM SHOWCASE PRIMITIVES END',
    start
  );

  expect(
    start,
    'release operating system showcase CSS block exists'
  ).toBeGreaterThanOrEqual(0);
  expect(
    end,
    'release operating system showcase CSS block is bounded'
  ).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('ReleaseOperatingSystemShowcase System B source contract', () => {
  it('keeps showcase markup on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');

    for (const pattern of forbiddenSourceVisualPatterns) {
      expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(source).toContain('system-b-release-operating-system-surface');
    expect(source).toContain('system-b-release-operating-system-mobile-stack');
    expect(source).toContain('system-b-release-operating-system-desktop-stage');
    expect(source).toContain(
      'system-b-release-operating-system-monitoring-panel'
    );
    expect(source).toContain('system-b-release-operating-system-slot');
    expect(source).toContain('data-slot=');
    expect(source).toContain('data-layout=');
    expect(source).toContain("aria-hidden='true'");
  });

  it('keeps release operating system showcase CSS tokenized and flat', () => {
    const css = extractReleaseOperatingSystemShowcaseCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenShowcaseCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--system-b-bg-surface-1)');
    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--color-text-quaternary-token)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--radius-');
    expect(css).toContain('display: none;');
    expect(css).toContain('@media (min-width: 1024px)');
  });

  it('renders stable slot primitives for ai, monitoring, and tasks surfaces', () => {
    const { container } = render(<ReleaseOperatingSystemShowcase />);

    expect(
      screen.getByTestId('homepage-release-operating-system-surface')
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-operating-system-ai')[0]
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-operating-system-monitoring')[0]
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-operating-system-tasks')[0]
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-operating-system-slot[data-slot="ai"][data-layout="desktop"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-operating-system-slot[data-slot="tasks"][data-layout="desktop"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-operating-system-slot[data-slot="monitoring"][data-layout="desktop"]'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('label-logo-orchard').length).toBeGreaterThan(
      0
    );
  });
});
