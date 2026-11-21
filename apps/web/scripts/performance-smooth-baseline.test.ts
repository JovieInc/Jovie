import { describe, expect, it } from 'vitest';
import {
  buildSurfaceBaseline,
  parseSmoothBaselineCliArgs,
  pickWorstSurface,
  renderSmoothBaselineMarkdown,
  type SmoothRunSample,
  type SmoothSurfaceBaseline,
  scoreSurfaceFailure,
} from './performance-smooth-baseline';
import { SMOOTH_SURFACES } from './performance-smooth-manifest';
import {
  isHydrationConsoleText,
  medianNumber,
} from './performance-smooth-probes';

function sample(overrides: Partial<SmoothRunSample> = {}): SmoothRunSample {
  return {
    attempt: 1,
    cls: 0.01,
    lcpMs: 1200,
    inpMs: 80,
    fcpMs: 900,
    ttfbMs: 200,
    fullPageReloads: 0,
    duplicateFetches: 0,
    flickerEvents: 0,
    hydrationWarnings: 0,
    flickerReasons: [],
    hydrationMessages: [],
    finalUrl: 'http://localhost:3000/',
    ...overrides,
  };
}

describe('performance-smooth-baseline helpers', () => {
  it('parses write/platform/surface flags', () => {
    const options = parseSmoothBaselineCliArgs([
      '--write',
      '--platform',
      'mobile',
      '--surface',
      'chat',
      '--runs',
      '3',
    ]);
    expect(options.write).toBe(true);
    expect(options.platforms).toEqual(['mobile']);
    expect(options.surfaceIds).toEqual(['chat']);
    expect(options.runs).toBe(3);
  });

  it('derives baseUrl from --share-url', () => {
    const options = parseSmoothBaselineCliArgs([
      '--share-url',
      'https://jovie-example-jovie.vercel.app/?_vercel_share=abc',
      '--surface',
      'homepage',
    ]);
    expect(options.shareUrl).toContain('_vercel_share=abc');
    expect(options.baseUrl).toBe('https://jovie-example-jovie.vercel.app');
    expect(options.surfaceIds).toEqual(['homepage']);
  });

  it('builds median baselines and flags', () => {
    const surface = SMOOTH_SURFACES.find(entry => entry.id === 'homepage')!;
    const baseline = buildSurfaceBaseline({
      surface,
      platform: 'desktop',
      route: {
        id: 'smooth-homepage-desktop',
        group: 'home',
        surface: 'homepage',
        path: '/',
        requiresAuth: false,
        warmupStrategy: 'public-route',
        measureMode: 'page-load',
        readySelectors: { content: ['#home-hero-heading'] },
        priority: 1,
        viewport: { width: 1512, height: 944 },
        timings: [],
      },
      resolvedPath: '/',
      baseUrl: 'http://localhost:3000',
      samples: [
        sample({ cls: 0.04, lcpMs: 3000, flickerEvents: 2 }),
        sample({ cls: 0.05, lcpMs: 3100, flickerEvents: 1 }),
        sample({ cls: 0.03, lcpMs: 2900, flickerEvents: 3 }),
      ],
      cpuThrottleRate: 1,
    });

    expect(baseline.median.cls).toBe(0.04);
    expect(baseline.median.lcpMs).toBe(3000);
    expect(baseline.median.flickerEvents).toBe(2);
    expect(baseline.flags.clsPass).toBe(false);
    expect(baseline.flags.lcpPass).toBe(false);
    expect(baseline.flags.flickerPass).toBe(false);
  });

  it('picks the worst failing surface', () => {
    const ok = buildSurfaceBaseline({
      surface: SMOOTH_SURFACES[0]!,
      platform: 'desktop',
      route: {
        id: 'a',
        group: 'home',
        surface: 'homepage',
        path: '/',
        requiresAuth: false,
        warmupStrategy: 'none',
        measureMode: 'page-load',
        readySelectors: {},
        priority: 1,
        viewport: { width: 1512, height: 944 },
      },
      resolvedPath: '/',
      baseUrl: 'http://localhost:3000',
      samples: [sample(), sample(), sample()],
      cpuThrottleRate: 1,
    });
    const bad = buildSurfaceBaseline({
      surface: SMOOTH_SURFACES.find(entry => entry.id === 'chat')!,
      platform: 'mobile',
      route: {
        id: 'b',
        group: 'creator-shell',
        surface: 'creator-app',
        path: '/app/chat',
        requiresAuth: true,
        warmupStrategy: 'none',
        measureMode: 'page-load',
        readySelectors: {},
        priority: 1,
        viewport: { width: 390, height: 844 },
      },
      resolvedPath: '/app/chat',
      baseUrl: 'http://localhost:3000',
      samples: [
        sample({ lcpMs: 5000, flickerEvents: 4 }),
        sample({ lcpMs: 5200, flickerEvents: 5 }),
        sample({ lcpMs: 4800, flickerEvents: 6 }),
      ],
      cpuThrottleRate: 4,
    });

    expect(scoreSurfaceFailure(bad)).toBeGreaterThan(scoreSurfaceFailure(ok));
    expect(pickWorstSurface([ok, bad])?.surfaceId).toBe('chat');
  });

  it('renders a markdown median table', () => {
    const baseline = buildSurfaceBaseline({
      surface: SMOOTH_SURFACES[0]!,
      platform: 'desktop',
      route: {
        id: 'a',
        group: 'home',
        surface: 'homepage',
        path: '/',
        requiresAuth: false,
        warmupStrategy: 'none',
        measureMode: 'page-load',
        readySelectors: {},
        priority: 1,
        viewport: { width: 1512, height: 944 },
      },
      resolvedPath: '/',
      baseUrl: 'http://localhost:3000',
      samples: [sample(), sample(), sample()],
      cpuThrottleRate: 1,
    });
    const md = renderSmoothBaselineMarkdown({
      schema: 'jovie-smooth-baseline-summary/v1',
      measuredAt: '2026-11-21T00:00:00.000Z',
      baseUrl: 'http://localhost:3000',
      runsPerCell: 3,
      surfaces: [baseline],
      worstSurfaceId: 'homepage',
      worstReason: 'homepage desktop: placeholder',
    });
    expect(md).toContain('| Surface | Platform | CLS |');
    expect(md).toContain('Homepage');
  });

  it('detects hydration console text and medians odd samples', () => {
    expect(isHydrationConsoleText('Hydration failed because the server')).toBe(
      true
    );
    expect(isHydrationConsoleText('fetch failed')).toBe(false);
    expect(medianNumber([3, 1, 2])).toBe(2);
  });
});

// Type-only sanity that baseline flags stay boolean for documentation tables.
export type _Flags = SmoothSurfaceBaseline['flags'];
