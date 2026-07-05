import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_HERO_RELEASE_MOCK,
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
} from '@/features/home/home-surface-seed';
import { ReleaseModeMockCard } from '@/features/home/ReleaseModeMockCard';

vi.mock('@/features/home/HomepageLabelLogoMark', () => ({
  HomepageLabelLogoMark: ({
    partner,
    className,
  }: {
    partner: string;
    className?: string;
  }) => (
    <div className={className} data-testid={`label-logo-${partner}`}>
      {partner}
    </div>
  ),
}));

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath = 'components/features/home/ReleaseModeMockCard.tsx';
const cssPath = 'styles/design-system.css';

const forbiddenSourceVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|text|ring|shadow|rounded|h|w|max-w|min-h|tracking|leading|px|py|pt|pb)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white|blue)-(?:[0-9]|\[|\/)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner|none|\[)/,
  /\b(?:transition-all|transition-transform|hover:brightness|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b/,
] as const;

const forbiddenReleaseModeCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /letter-spacing:\s*-[^;]+/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractReleaseModeCss(source: string): string {
  const start = source.indexOf(
    'SYSTEM B HOME RELEASE MODE MOCK CARD PRIMITIVES'
  );
  const end = source.indexOf('SYSTEM B ONBOARDING V2 PRIMITIVES', start);

  expect(start, 'release-mode CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'release-mode CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('release mode mock card System B source contract', () => {
  it('keeps release mock visuals on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');

    for (const pattern of forbiddenSourceVisualPatterns) {
      expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(source).toContain('system-b-release-mode-card');
    expect(source).toContain('system-b-release-mode-artwork');
    expect(source).toContain('system-b-release-mode-state-pill');
    expect(source).toContain('system-b-release-mode-progress-fill');
    expect(source).toContain('data-state={release.state}');
    expect(source).toContain('data-tone={tone}');
    expect(source).toContain('data-layout={bodyLayout}');
  });

  it('keeps release mock CSS tokenized and flat', () => {
    const css = extractReleaseModeCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenReleaseModeCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('--system-b-release-mode-tone');
    expect(css).toContain('var(--color-info)');
    expect(css).toContain('var(--color-accent)');
    expect(css).toContain('var(--color-success)');
    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--system-b-bg-surface-1)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--radius-');
  });

  it('renders stable state and tone data attributes for both release states', () => {
    const { container, rerender } = render(
      <ReleaseModeMockCard
        release={HOME_HERO_RELEASE_MOCK}
        testId='release-mode-card'
        variant='compact'
      />
    );

    expect(screen.getByTestId('release-mode-card')).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-mode-artwork[data-tone="violet"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-mode-state-pill[data-state="presave"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-mode-progress-fill[data-state="presave"]'
      )
    ).toBeInTheDocument();

    rerender(
      <ReleaseModeMockCard
        release={HOME_RELEASE_DESTINATION_LIVE_MOCK}
        testId='release-mode-card'
        variant='comparison'
      />
    );

    expect(
      container.querySelector(
        '.system-b-release-mode-artwork[data-tone="blue"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-mode-state-pill[data-state="live"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.system-b-release-mode-progress-fill[data-state="live"]'
      )
    ).toBeInTheDocument();
  });
});
