import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSurfaceBaseline,
  parseSmoothBaselineCliArgs,
  pickWorstSurface,
  renderSmoothBaselineMarkdown,
  type SmoothRunSample,
  scoreSurfaceFailure,
  writeSmoothBaselines,
} from './performance-smooth-baseline';
import { SMOOTH_SURFACES } from './performance-smooth-manifest';
import {
  classifySameRouteJank,
  smoothRouteIdentity,
} from './performance-smooth-measure';
import {
  emptySmoothProbeSnapshot,
  isHydrationConsoleText,
  medianNullable,
  medianNumber,
} from './performance-smooth-probes';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const sample = (o: Partial<SmoothRunSample> = {}): SmoothRunSample => ({
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
  ...o,
});

const route = (id: string, path: string, w = 1512, h = 944) => ({
  id,
  group: 'home' as const,
  surface: 'homepage' as const,
  path,
  requiresAuth: false,
  warmupStrategy: 'none' as const,
  measureMode: 'page-load' as const,
  readySelectors: {},
  priority: 1,
  viewport: { width: w, height: h },
});

describe('performance-smooth-baseline helpers', () => {
  it('parses CLI flags including share-url', () => {
    expect(
      parseSmoothBaselineCliArgs([
        '--write',
        '--platform',
        'mobile',
        '--surface',
        'chat',
        '--runs',
        '3',
      ])
    ).toMatchObject({
      write: true,
      platforms: ['mobile'],
      surfaceIds: ['chat'],
      runs: 3,
    });
    const shared = parseSmoothBaselineCliArgs([
      '--share-url',
      'https://jovie-example-jovie.vercel.app/?_vercel_share=abc',
      '--surface',
      'homepage',
    ]);
    expect(shared.shareUrl).toContain('_vercel_share=abc');
    expect(shared.baseUrl).toBe('https://jovie-example-jovie.vercel.app');
  });

  it('builds medians, ranks worst, and renders markdown', () => {
    const surface = SMOOTH_SURFACES.find(e => e.id === 'homepage');
    const chat = SMOOTH_SURFACES.find(e => e.id === 'chat');
    expect(surface && chat).toBeTruthy();
    if (!surface || !chat) return;
    const ok = buildSurfaceBaseline({
      surface,
      platform: 'desktop',
      route: route('a', '/'),
      resolvedPath: '/',
      baseUrl: 'http://localhost:3000',
      samples: [sample(), sample(), sample()],
      cpuThrottleRate: 1,
    });
    const bad = buildSurfaceBaseline({
      surface: chat,
      platform: 'mobile',
      route: route('b', '/app/chat', 390, 844),
      resolvedPath: '/app/chat',
      baseUrl: 'http://localhost:3000',
      samples: [
        sample({ lcpMs: 5000, flickerEvents: 4 }),
        sample({ lcpMs: 5200, flickerEvents: 5 }),
        sample({ lcpMs: 4800, flickerEvents: 6 }),
      ],
      cpuThrottleRate: 4,
    });
    const failing = buildSurfaceBaseline({
      surface,
      platform: 'desktop',
      route: route('c', '/'),
      resolvedPath: '/',
      baseUrl: 'http://localhost:3000',
      samples: [
        sample({ cls: 0.04, lcpMs: 3000, flickerEvents: 2 }),
        sample({ cls: 0.05, lcpMs: 3100, flickerEvents: 1 }),
        sample({ cls: 0.03, lcpMs: 2900, flickerEvents: 3 }),
      ],
      cpuThrottleRate: 1,
    });
    expect(failing.median.cls).toBe(0.04);
    expect(failing.flags.clsPass).toBe(false);
    expect(scoreSurfaceFailure(bad)).toBeGreaterThan(scoreSurfaceFailure(ok));
    expect(pickWorstSurface([ok, bad])?.surfaceId).toBe('chat');
    expect(
      renderSmoothBaselineMarkdown({
        schema: 'jovie-smooth-baseline-summary/v1',
        measuredAt: '2026-11-21T00:00:00.000Z',
        baseUrl: 'http://localhost:3000',
        runsPerCell: 3,
        surfaces: [ok],
        worstSurfaceId: 'homepage',
        worstReason: 'placeholder',
      })
    ).toContain('Homepage');
  });

  it('classifies same-route jank and covers CLI/write helpers', () => {
    expect(isHydrationConsoleText('Hydration failed')).toBe(true);
    expect(medianNumber([3, 1, 2])).toBe(2);
    expect(medianNumber([])).toBe(0);
    expect(medianNullable([null, null])).toBeNull();
    expect(medianNullable([null, 4, 2])).toBe(4);
    expect(emptySmoothProbeSnapshot().fullPageReloads).toBe(0);
    expect(smoothRouteIdentity('not a url')).toBe('not a url');
    const measured = smoothRouteIdentity('https://preview.example/');
    expect(
      classifySameRouteJank({
        measuredRoute: measured,
        finalUrl: 'https://preview.example/start',
        documentUrls: [
          'https://preview.example/',
          'https://preview.example/start',
        ],
        probeReloads: 0,
        probeDuplicateFetches: 4,
        settleDuplicateFetches: 1,
        settleProbeReloads: 0,
      })
    ).toEqual({ fullPageReloads: 0, duplicateFetches: 1 });
    expect(
      classifySameRouteJank({
        measuredRoute: measured,
        finalUrl: 'https://preview.example/',
        documentUrls: ['https://preview.example/', 'https://preview.example/'],
        probeReloads: 1,
        probeDuplicateFetches: 2,
        settleDuplicateFetches: 0,
        settleProbeReloads: 0,
      })
    ).toEqual({ fullPageReloads: 1, duplicateFetches: 2 });

    const dir = mkdtempSync(join(tmpdir(), 'smooth-cov-'));
    temps.push(dir);
    const auth = join(dir, 'auth.json');
    expect(
      parseSmoothBaselineCliArgs([
        '--json',
        '--auth-path',
        auth,
        '--out-dir',
        dir,
        '--base-url',
        'http://127.0.0.1:3100',
        '--runs',
        '5',
      ])
    ).toMatchObject({ json: true, authPath: auth, outDir: dir, runs: 5 });
    expect(() => parseSmoothBaselineCliArgs(['--runs', '2'])).toThrow(/odd/);
    expect(() => parseSmoothBaselineCliArgs(['--platform', 'x'])).toThrow(
      /desktop/
    );
    expect(() => parseSmoothBaselineCliArgs(['--surface', 'x'])).toThrow(
      /Unknown/
    );
    expect(() => parseSmoothBaselineCliArgs(['--mystery'])).toThrow(/Unknown/);
    expect(() => parseSmoothBaselineCliArgs(['--base-url'])).toThrow(/Missing/);

    const homepage = SMOOTH_SURFACES.find(s => s.id === 'homepage');
    expect(homepage).toBeTruthy();
    if (!homepage) return;
    const baseline = buildSurfaceBaseline({
      surface: homepage,
      platform: 'desktop',
      route: route('home', '/'),
      resolvedPath: '/',
      baseUrl: 'http://localhost:3000',
      samples: [
        sample({ inpMs: null, hydrationWarnings: 1 }),
        sample({ inpMs: null, hydrationWarnings: 0 }),
        sample({ inpMs: null, hydrationWarnings: 2 }),
      ],
      cpuThrottleRate: 1,
    });
    const summaryPath = writeSmoothBaselines(
      {
        schema: 'jovie-smooth-baseline-summary/v1',
        measuredAt: '2026-11-21T00:00:00.000Z',
        baseUrl: 'http://localhost:3000',
        runsPerCell: 3,
        surfaces: [baseline],
        worstSurfaceId: 'homepage',
        worstReason: 'hydration',
      },
      dir
    );
    expect(
      (
        JSON.parse(readFileSync(summaryPath, 'utf8')) as {
          surfaces: Array<{ median: { hydrationWarnings: number } }>;
        }
      ).surfaces[0]?.median.hydrationWarnings
    ).toBe(1);
    expect(
      JSON.parse(readFileSync(join(dir, 'homepage.desktop.json'), 'utf8'))
    ).not.toHaveProperty('samples');
    expect(pickWorstSurface([])).toBeNull();
    expect(pickWorstSurface([baseline])?.surfaceId).toBe('homepage');
  });
});
