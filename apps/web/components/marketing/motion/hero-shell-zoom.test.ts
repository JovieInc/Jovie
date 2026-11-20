import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CINEMATIC_CURVE } from '@/lib/motion/presets';
import {
  bindHeroShellZoom,
  cubicBezier,
  heroZoomFrame,
  heroZoomProgress,
  parseCubicBezier,
} from './hero-shell-zoom';

const REST = 1248 / 1348;

describe('cubicBezier', () => {
  it('hits the endpoints and the linear midpoint', () => {
    expect(cubicBezier(CINEMATIC_CURVE, 0)).toBe(0);
    expect(cubicBezier(CINEMATIC_CURVE, 1)).toBe(1);
    expect(cubicBezier([0, 0, 1, 1], 0.5)).toBeCloseTo(0.5, 3);
  });

  it('is strongly front-loaded on the cinematic curve', () => {
    expect(cubicBezier(CINEMATIC_CURVE, 0.2)).toBeGreaterThan(0.5);
    expect(cubicBezier(CINEMATIC_CURVE, 0.5)).toBeGreaterThan(0.9);
  });

  it('parses the token value and rejects anything else', () => {
    expect(parseCubicBezier('cubic-bezier(0.22, 1, 0.36, 1)')).toEqual([
      0.22, 1, 0.36, 1,
    ]);
    expect(parseCubicBezier(' cubic-bezier( 0.4,0,0.2 ,1) ')).toEqual([
      0.4, 0, 0.2, 1,
    ]);
    expect(parseCubicBezier('ease-out')).toBeNull();
    expect(parseCubicBezier('cubic-bezier(1, 2, 3)')).toBeNull();
  });

  it('reads the same curve the CSS token declares', () => {
    const css = readFileSync(
      join(__dirname, '../../../styles/design-system.css'),
      'utf8'
    );
    const value = /--ds-motion-cinematic-easing:\s*([^;]+);/.exec(css)?.[1];
    expect(parseCubicBezier(value ?? '')).toEqual([...CINEMATIC_CURVE]);
  });
});

describe('heroZoomFrame', () => {
  it('starts zoomed in with the headline at its start and no frame edge', () => {
    const f = heroZoomFrame(0);
    expect(f.shellScale).toBeCloseTo(1.94, 5);
    // anchor (602,470) sits at (720,620): translate = anchor_page - anchor*s
    expect(f.shellTranslate.x).toBeCloseTo(720 - 602 * 1.94, 3);
    expect(f.shellTranslate.y).toBeCloseTo(620 - 470 * 1.94, 3);
    expect(f.headlineY).toBeCloseTo(132, 5);
    expect(f.headlineOpacity).toBe(1);
    expect(f.frameEdgeOpacity).toBe(0);
    expect(f.logoRowOpacity).toBe(0);
  });

  it('rests at the frame once the zoom range ends', () => {
    const f = heroZoomFrame(1);
    expect(f.shellScale).toBeCloseTo(REST, 5);
    expect(f.shellTranslate.x).toBeCloseTo(96 + 602 * REST - 602 * REST, 3);
    expect(f.shellTranslate.y).toBeCloseTo(384, 3);
    expect(f.headlineY).toBeCloseTo(144, 5);
    expect(f.headlineOpacity).toBeCloseTo(1, 5);
    expect(f.frameEdgeOpacity).toBe(1);
    expect(f.logoRowOpacity).toBe(1);
    expect(heroZoomFrame(0.75).shellScale).toBeCloseTo(REST, 5);
  });

  it('holds the zoom still before p = 0.05', () => {
    expect(heroZoomFrame(0.03)).toEqual(heroZoomFrame(0));
  });

  it('dims and lifts the headline at the midpoint of the move', () => {
    // z = 0.5 where the eased value crosses a half; find p by bisection.
    let lo = 0.05;
    let hi = 0.75;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (heroZoomFrame(mid).frameEdgeOpacity < 0.5) lo = mid;
      else hi = mid;
    }
    const f = heroZoomFrame(lo);
    expect(f.frameEdgeOpacity).toBeCloseTo(0.5, 2);
    expect(f.headlineOpacity).toBeCloseTo(0.5, 1);
    expect(f.headlineY).toBeCloseTo((132 + 144) / 2 - 40, 0);
    expect(f.shellScale).toBeCloseTo((1.94 + REST) / 2, 1);
  });

  it('brings the logo row in only from p = 0.85', () => {
    expect(heroZoomFrame(0.85).logoRowOpacity).toBe(0);
    expect(heroZoomFrame(0.925).logoRowOpacity).toBeCloseTo(0.5, 5);
  });

  it('only ever shrinks the shell', () => {
    let last = Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const s = heroZoomFrame(p).shellScale;
      expect(s).toBeLessThanOrEqual(last + 1e-9);
      last = s;
    }
  });
});

describe('heroZoomProgress', () => {
  it('maps one viewport of scroll onto 0..1 and clamps', () => {
    expect(heroZoomProgress(0, 900)).toBe(0);
    expect(heroZoomProgress(450, 900)).toBe(0.5);
    expect(heroZoomProgress(5000, 900)).toBe(1);
    expect(heroZoomProgress(-10, 900)).toBe(0);
    expect(heroZoomProgress(100, 0)).toBe(0);
    expect(heroZoomProgress(Number.NaN, 900)).toBe(0);
  });
});

function setup(reduced: boolean) {
  const listeners = new Map<string, EventListener>();
  const root = document.createElement('section');
  const view = root.ownerDocument.defaultView as Window;
  vi.spyOn(view, 'matchMedia').mockReturnValue({
    matches: reduced,
  } as MediaQueryList);
  const add = vi
    .spyOn(view, 'addEventListener')
    .mockImplementation((type, listener) => {
      listeners.set(type, listener as EventListener);
    });
  const remove = vi.spyOn(view, 'removeEventListener');
  return { root, view, listeners, add, remove };
}

describe('bindHeroShellZoom', () => {
  it('reduced motion writes the rest frame and listens to nothing', () => {
    const { root, listeners } = setup(true);
    const cleanup = bindHeroShellZoom(root);
    expect(listeners.size).toBe(0);
    expect(root.style.getPropertyValue('--hero-zoom-scale')).toBe(
      REST.toFixed(3)
    );
    expect(root.style.getPropertyValue('--hero-zoom-logos-o')).toBe('1.000');
    expect(root.style.getPropertyValue('--hero-zoom-logos-y')).toBe('0.000px');
    expect(() => cleanup()).not.toThrow();
    vi.restoreAllMocks();
  });

  it('follows scroll from a passive listener and cleans up', () => {
    const { root, view, listeners, add, remove } = setup(false);
    Object.defineProperty(view, 'innerHeight', {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(view, 'scrollY', { value: 0, configurable: true });
    const cleanup = bindHeroShellZoom(root);
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
    expect(root.style.getPropertyValue('--hero-zoom-scale')).toBe('1.940');
    Object.defineProperty(view, 'scrollY', { value: 800, configurable: true });
    listeners.get('scroll')?.(new Event('scroll'));
    expect(root.style.getPropertyValue('--hero-zoom-scale')).toBe(
      REST.toFixed(3)
    );
    cleanup();
    expect(remove).toHaveBeenCalledWith('scroll', listeners.get('scroll'));
    vi.restoreAllMocks();
  });

  it('never intercepts wheel or touch', () => {
    const source = readFileSync(join(__dirname, 'hero-shell-zoom.ts'), 'utf8');
    expect(source).not.toMatch(
      /\.preventDefault|addEventListener\(\s*['"](?:wheel|touch)/
    );
  });
});
