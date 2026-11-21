import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowedRegression,
  assertPublicBaselinesPresent,
  compareMetric,
  compareSurface,
  evaluateSmoothRatchet,
  findBaselineRaises,
  loadCommittedBaselines,
  parseSmoothRatchetCliArgs,
  runSmoothRatchetCli,
  SMOOTH_BASELINE_DIR,
  SMOOTH_NOISE_POLICY,
  SMOOTH_RATCHET_PUBLIC_SURFACES,
} from './performance-smooth-ratchet';
import type {
  SmoothBaselineSummary,
  SmoothSurfaceBaseline,
} from './performance-smooth-types';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function baseline(
  overrides: Partial<SmoothSurfaceBaseline> &
    Pick<SmoothSurfaceBaseline, 'surfaceId' | 'platform' | 'median'>
): SmoothSurfaceBaseline {
  return {
    schema: 'jovie-smooth-baseline/v1',
    label: overrides.surfaceId,
    routeId: 'home',
    resolvedPath: '/',
    measuredAt: '2026-11-21T00:00:00.000Z',
    baseUrl: 'http://localhost:3000',
    runs: 3,
    cpuThrottleRate: 1,
    viewport: { width: 1512, height: 944 },
    targets: {
      cls: 0.02,
      lcpMs: 2000,
      inpMs: 150,
      fullPageReloads: 0,
      duplicateFetches: 0,
      flickerEvents: 0,
      hydrationWarnings: 0,
    },
    flags: {
      clsPass: true,
      lcpPass: true,
      inpPass: true,
      reloadPass: true,
      dupFetchPass: true,
      flickerPass: true,
      hydrationPass: true,
    },
    samples: [],
    ...overrides,
  };
}

function summary(
  surfaces: SmoothSurfaceBaseline[]
): SmoothBaselineSummary {
  return {
    schema: 'jovie-smooth-baseline-summary/v1',
    measuredAt: '2026-11-21T00:00:00.000Z',
    baseUrl: 'http://localhost:3000',
    runsPerCell: 3,
    surfaces,
    worstSurfaceId: surfaces[0]?.surfaceId ?? null,
    worstReason: null,
  };
}

describe('performance-smooth-ratchet', () => {
  it('passes flat medians and fails planted regressions beyond noise', () => {
    const committed = baseline({
      surfaceId: 'homepage',
      platform: 'desktop',
      median: {
        cls: 0.002,
        lcpMs: 456,
        inpMs: 1,
        fcpMs: 342,
        ttfbMs: 100,
        fullPageReloads: 1,
        duplicateFetches: 1,
        flickerEvents: 0,
        hydrationWarnings: 0,
      },
    });
    const flat = evaluateSmoothRatchet({
      measured: summary([committed]),
      committed: [committed],
    });
    expect(flat.status).toBe('pass');

    const worse = evaluateSmoothRatchet({
      measured: summary([
        baseline({
          surfaceId: 'homepage',
          platform: 'desktop',
          median: {
            ...committed.median,
            lcpMs: committed.median.lcpMs + 400,
            flickerEvents: 2,
          },
        }),
      ]),
      committed: [committed],
    });
    expect(worse.status).toBe('fail');
    expect(worse.failures.join('\n')).toMatch(/lcpMs/);
    expect(worse.failures.join('\n')).toMatch(/flickerEvents/);
  });

  it('tolerates LCP within absolute noise and CLS within relative band', () => {
    expect(allowedRegression('lcpMs', 456)).toBe(
      Math.max(456 * SMOOTH_NOISE_POLICY.lcpMs.relativeTolerance, 150)
    );
    expect(
      compareMetric({ metric: 'lcpMs', baseline: 456, measured: 456 + 149 })
        .status
    ).toBe('pass');
    expect(
      compareMetric({ metric: 'lcpMs', baseline: 456, measured: 456 + 151 })
        .status
    ).toBe('fail');
    expect(
      compareMetric({ metric: 'cls', baseline: 0.02, measured: 0.024 }).status
    ).toBe('pass');
    expect(
      compareMetric({ metric: 'cls', baseline: 0.02, measured: 0.026 }).status
    ).toBe('fail');
  });

  it('treats count increases as regressions and skips null INP', () => {
    expect(
      compareMetric({
        metric: 'fullPageReloads',
        baseline: 0,
        measured: 1,
      }).status
    ).toBe('fail');
    expect(
      compareMetric({ metric: 'inpMs', baseline: 4, measured: null }).status
    ).toBe('skip');
  });

  it('loads committed public baselines and rejects raises without allowRaise', () => {
    const committed = loadCommittedBaselines(SMOOTH_BASELINE_DIR);
    assertPublicBaselinesPresent(committed);
    expect(SMOOTH_RATCHET_PUBLIC_SURFACES).toHaveLength(3);
    expect(
      committed.filter(entry =>
        (SMOOTH_RATCHET_PUBLIC_SURFACES as readonly string[]).includes(
          entry.surfaceId
        )
      ).length
    ).toBe(6);

    const artist = committed.find(
      entry =>
        entry.surfaceId === 'artist-profile' && entry.platform === 'desktop'
    );
    expect(artist).toBeTruthy();
    if (!artist) return;
    const raised = {
      ...artist,
      median: { ...artist.median, cls: artist.median.cls + 0.02 },
    };
    expect(
      findBaselineRaises({ previous: committed, next: [raised] })
    ).not.toHaveLength(0);
    expect(
      findBaselineRaises({
        previous: committed,
        next: [raised],
        allowRaise: true,
      })
    ).toHaveLength(0);
  });

  it('compareSurface names the failing metric and CLI --check passes', () => {
    const committed = baseline({
      surfaceId: 'onboarding-start',
      platform: 'mobile',
      median: {
        cls: 0,
        lcpMs: 300,
        inpMs: 4,
        fcpMs: 225,
        ttfbMs: 100,
        fullPageReloads: 0,
        duplicateFetches: 0,
        flickerEvents: 0,
        hydrationWarnings: 0,
      },
    });
    const verdict = compareSurface({
      committed,
      measured: {
        ...committed,
        median: { ...committed.median, hydrationWarnings: 1 },
      },
    });
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toMatch(/hydrationWarnings/);

    expect(parseSmoothRatchetCliArgs(['--check']).check).toBe(true);
    const ok = runSmoothRatchetCli(['--check']);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toMatch(/Smooth baselines OK/);
  });

  it('CLI compares a measured summary file and exits non-zero on regression', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smooth-ratchet-'));
    temps.push(dir);
    const committed = loadCommittedBaselines(SMOOTH_BASELINE_DIR);
    const homepage = committed.find(
      entry => entry.surfaceId === 'homepage' && entry.platform === 'desktop'
    );
    expect(homepage).toBeTruthy();
    if (!homepage) return;
    const measuredPath = join(dir, 'measured.json');
    writeFileSync(
      measuredPath,
      JSON.stringify(
        summary([
          baseline({
            surfaceId: 'homepage',
            platform: 'desktop',
            median: {
              ...homepage.median,
              duplicateFetches: homepage.median.duplicateFetches + 1,
            },
          }),
        ])
      )
    );
    const result = runSmoothRatchetCli([
      '--measured',
      measuredPath,
      '--baseline-dir',
      SMOOTH_BASELINE_DIR,
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/duplicateFetches/);

    const flatPath = join(dir, 'flat.json');
    writeFileSync(
      flatPath,
      JSON.stringify(
        summary([
          baseline({
            surfaceId: 'homepage',
            platform: 'desktop',
            median: homepage.median,
          }),
        ])
      )
    );
    expect(runSmoothRatchetCli(['--measured', flatPath]).code).toBe(0);
    expect(
      JSON.parse(readFileSync(join(SMOOTH_BASELINE_DIR, 'summary.json'), 'utf8'))
        .schema
    ).toBe('jovie-smooth-baseline-summary/v1');
  });
});
