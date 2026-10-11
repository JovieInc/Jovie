import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const cssPath = 'app/(home)/home.css';
const heroComponentPath = 'components/homepage/HomepageEditorialHero.tsx';

function extractMountedHeroCss(source: string): string {
  const start = source.indexOf('HOMEPAGE EDITORIAL HERO START');
  const end = source.indexOf('HOMEPAGE EDITORIAL HERO END', start);

  expect(start, 'mounted hero CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'mounted hero CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

const heroCss = extractMountedHeroCss(
  readFileSync(path.join(webRoot, cssPath), 'utf8')
);

describe('homepage hero carbon-frame scroll transition (JOV-6296)', () => {
  it('is a scroll-driven animation on the hero section, not a layout shift', () => {
    expect(heroCss).toContain('@supports (animation-timeline: scroll())');
    expect(heroCss).toContain('animation-timeline: scroll(root)');
    // The hero itself is the animated surface; copy/search markup is untouched.
    expect(heroCss).toMatch(
      /\.homepage-editorial-hero\s*\{[^}]*animation:\s*homepage-editorial-hero-frame/
    );
    expect(heroCss).toContain('@keyframes homepage-editorial-hero-frame');
  });

  it('never scales the hero more than ~4% and resolves to the carbon radius', () => {
    const scale = heroCss.match(/transform:\s*scale\((0?\.\d+|1)\)/g) ?? [];
    const settled = scale
      .map(value => Number.parseFloat(value.replace(/[^0-9.]/g, '')))
      .filter(value => value < 1);
    expect(settled.length).toBeGreaterThan(0);
    for (const value of settled) {
      expect(value).toBeGreaterThanOrEqual(0.96);
    }
    expect(heroCss).toContain('border-radius: var(--system-b-radius-panel)');
  });

  it('runs over a bounded scroll interval and paints near-black gutters', () => {
    const range = heroCss.match(/animation-range:\s*0px\s+([^;]+);/);
    expect(range, 'scroll interval is bounded').not.toBeNull();
    expect(heroCss).toContain('background: var(--system-b-cinematic-black)');
  });

  it('is inert under reduced motion and degrades to the certified still', () => {
    expect(heroCss).toMatch(
      /@supports \(animation-timeline: scroll\(\)\)\s*\{\s*@media \(prefers-reduced-motion: no-preference\)/
    );
    // No JS driver: the component must not grow a scroll handler.
    const heroSource = readFileSync(
      path.join(webRoot, heroComponentPath),
      'utf8'
    );
    expect(heroSource).not.toMatch(
      /useScroll|addEventListener\('scroll'|onScroll/
    );
  });
});
