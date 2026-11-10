import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  bindHeroCanvasScroll,
  HERO_CANVAS_SCROLL_RANGE,
  heroCanvasScrollProgress,
  heroCanvasScrollRange,
} from './hero-light-scroll';

describe('heroCanvasScrollProgress', () => {
  const range = heroCanvasScrollRange(900);

  it('maps scroll position onto 0..1 across 42svh and reverses', () => {
    expect(range).toBe(900 * HERO_CANVAS_SCROLL_RANGE);
    expect(heroCanvasScrollProgress(0, range)).toBe(0);
    expect(heroCanvasScrollProgress(range / 2, range)).toBeCloseTo(0.5);
    expect(heroCanvasScrollProgress(range, range)).toBe(1);
    expect(heroCanvasScrollProgress(range + 40, range)).toBe(1);
    expect(heroCanvasScrollProgress(range / 2, range)).toBeGreaterThan(
      heroCanvasScrollProgress(range / 4, range)
    );
    expect(heroCanvasScrollProgress(-20, range)).toBe(0);
  });
});

describe('bindHeroCanvasScroll', () => {
  it('does not intercept wheel or touch', () => {
    const source = readFileSync(
      join(__dirname, 'hero-light-scroll.ts'),
      'utf8'
    );
    expect(source).not.toMatch(
      /\.preventDefault|addEventListener\(\s*['"](?:wheel|touch)/
    );
  });

  it('writes progress from a passive scroll listener when timelines are missing', () => {
    const listeners = new Map<string, EventListener>();
    const root = document.createElement('section');
    root.dataset.heroCanvasScroll = 'fallback';
    const view = {
      scrollY: 0,
      innerHeight: 1000,
      matchMedia: () => ({ matches: false }),
      CSS: { supports: () => false },
      addEventListener: (
        type: string,
        listener: EventListener,
        options?: { passive?: boolean }
      ) => {
        expect(type).toBe('scroll');
        expect(options).toEqual({ passive: true });
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    };
    vi.spyOn(root.ownerDocument, 'defaultView', 'get').mockReturnValue(
      view as never
    );

    const stop = bindHeroCanvasScroll(root);
    expect(root.style.getPropertyValue('--hero-canvas-progress')).toBe('0');

    view.scrollY = heroCanvasScrollRange(1000) / 2;
    listeners.get('scroll')?.(new Event('scroll'));
    expect(
      Number(root.style.getPropertyValue('--hero-canvas-progress'))
    ).toBeCloseTo(0.5);

    view.scrollY = 0;
    listeners.get('scroll')?.(new Event('scroll'));
    expect(root.style.getPropertyValue('--hero-canvas-progress')).toBe('0');

    stop();
    expect(listeners.size).toBe(0);
  });

  it('leaves the full-bleed still under reduced motion', () => {
    const root = document.createElement('section');
    const addEventListener = vi.fn();
    vi.spyOn(root.ownerDocument, 'defaultView', 'get').mockReturnValue({
      scrollY: 400,
      innerHeight: 800,
      matchMedia: () => ({ matches: true }),
      CSS: { supports: () => false },
      addEventListener,
      removeEventListener: vi.fn(),
    } as never);

    bindHeroCanvasScroll(root);
    expect(addEventListener).not.toHaveBeenCalled();
    expect(root.style.getPropertyValue('--hero-canvas-progress')).toBe('');
  });
});
