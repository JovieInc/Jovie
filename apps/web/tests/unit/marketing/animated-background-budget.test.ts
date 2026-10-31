import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANIMATED_BACKGROUND_BUDGET,
  ANIMATED_BACKGROUND_MAX_RENDER_MS_PER_FRAME,
  type AnimatedBackgroundBudgetEntry,
  isAnimatedBackgroundEnabled,
} from '@/data/marketing/animatedBackgroundBudget';

/**
 * Marketing animated-background budget guard (Tim, 2026-10-29). Marketing
 * heroes are static matte by default: any WebGL context or canvas animation
 * loop under the marketing roots must be registered, budgeted at <= 2ms per
 * frame, disabled by default, and keep a reduced-motion static fallback.
 */
const WEB_ROOT = join(__dirname, '../../..');
const ROOTS = [
  'components/marketing',
  'components/homepage',
  'app/(marketing)',
  'app/(home)',
];
const SKIP_DIRS = new Set(['node_modules', '.next', '__snapshots__']);
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs)$/;
const NON_PRODUCTION = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;

const WEBGL = /getContext\(\s*['"]webgl|['"]webgl2['"]|WebGL2?RenderingContext/;
const CANVAS = /<canvas\b|getContext\(|HTMLCanvasElement|OffscreenCanvas/;
const LOOP = /requestAnimationFrame/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE.test(name) && !NON_PRODUCTION.test(name)) {
      out.push(full);
    }
  }
}

export function animatedBackgroundKind(source: string): string | null {
  if (WEBGL.test(source)) return 'webgl';
  if (CANVAS.test(source) && LOOP.test(source)) return 'canvas-loop';
  return null;
}

function animatedBackgroundFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) walk(join(WEB_ROOT, root), files);
  return files
    .filter(file => animatedBackgroundKind(readFileSync(file, 'utf8')))
    .map(file => relative(WEB_ROOT, file).split(sep).join('/'))
    .sort();
}

function entryFor(file: string): AnimatedBackgroundBudgetEntry | undefined {
  return (
    ANIMATED_BACKGROUND_BUDGET as readonly AnimatedBackgroundBudgetEntry[]
  ).find(entry =>
    entry.files.some(registered =>
      registered.endsWith('/')
        ? file.startsWith(registered)
        : file === registered
    )
  );
}

describe('marketing animated-background budget', () => {
  it('detects WebGL contexts and canvas animation loops', () => {
    expect(animatedBackgroundKind("canvas.getContext('webgl2')")).toBe('webgl');
    expect(animatedBackgroundKind('typeof WebGL2RenderingContext')).toBe(
      'webgl'
    );
    expect(
      animatedBackgroundKind(
        "const ctx = canvas.getContext('2d'); requestAnimationFrame(draw);"
      )
    ).toBe('canvas-loop');
    expect(animatedBackgroundKind('requestAnimationFrame(measure)')).toBeNull();
  });

  it('registers every WebGL context and canvas loop under the marketing roots', () => {
    const unregistered = animatedBackgroundFiles().filter(
      file => !entryFor(file)
    );
    expect(unregistered).toEqual([]);
  });

  it.each(
    ANIMATED_BACKGROUND_BUDGET as readonly AnimatedBackgroundBudgetEntry[]
  )('$id stays within budget and static by default', entry => {
    expect(entry.maxRenderMsPerFrame).toBeGreaterThan(0);
    expect(entry.maxRenderMsPerFrame).toBeLessThanOrEqual(
      ANIMATED_BACKGROUND_MAX_RENDER_MS_PER_FRAME
    );
    expect(entry.defaultEnabled).toBe(false);
    for (const file of entry.files) {
      expect(existsSync(join(WEB_ROOT, file)), file).toBe(true);
    }
    const fallback = readFileSync(
      join(WEB_ROOT, entry.reducedMotionFallback),
      'utf8'
    );
    expect(fallback).toContain('prefers-reduced-motion');
  });

  it('keeps the homepage hero light static unless its budget enables it', () => {
    expect(isAnimatedBackgroundEnabled('homepage-hero-light')).toBe(false);
    const light = readFileSync(
      join(WEB_ROOT, 'components/homepage/hero-light/HomepageHeroLight.tsx'),
      'utf8'
    );
    expect(light).toContain(
      "isAnimatedBackgroundEnabled('homepage-hero-light')"
    );
    const css = readFileSync(
      join(WEB_ROOT, 'components/homepage/hero-light/HomepageHeroLight.css'),
      'utf8'
    );
    const defaultEdge =
      css.match(/\n\.homepage-hero-light__edge\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(defaultEdge).not.toMatch(/\banimation\s*:/);
  });
});
