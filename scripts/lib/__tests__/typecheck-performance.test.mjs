import { describe, expect, it } from 'vitest';
import {
  aggregateScenarioResults,
  calculateStatistics,
  evaluatePerformanceConstraints,
  evaluateRatchet,
  isValidHistoricalScenario,
  nearestRankPercentile,
  parseExtendedDiagnostics,
  parseTimeOutput,
  selectRatchetBaseline,
} from '../typecheck-performance.mjs';

describe('typecheck performance statistics', () => {
  it('calculates nearest-rank percentiles and population statistics', () => {
    const samples = [5, 1, 4, 2, 3];
    expect(nearestRankPercentile(samples, 50)).toBe(3);
    expect(nearestRankPercentile(samples, 95)).toBe(5);
    expect(calculateStatistics(samples)).toMatchObject({
      count: 5,
      min: 1,
      max: 5,
      mean: 3,
      variance: 2,
      p50: 3,
      p95: 5,
    });
    expect(calculateStatistics(samples).coefficientOfVariation).toBeCloseTo(
      Math.sqrt(2) / 3
    );
  });

  it('returns an explicit empty summary and rejects invalid samples', () => {
    expect(calculateStatistics([])).toMatchObject({
      count: 0,
      p50: null,
      p95: null,
    });
    expect(() => nearestRankPercentile([1, Number.NaN], 50)).toThrow(TypeError);
    expect(() => nearestRankPercentile([1], 0)).toThrow(RangeError);
  });
});

describe('typecheck performance parsers', () => {
  it('parses TypeScript counts, memory, and extended diagnostic timings', () => {
    const parsed = parseExtendedDiagnostics(`
Files:                         2,345
Lines of TypeScript:         98,765
Identifiers:                120,000
Symbols:                    80,000
Types:                      45,000
Instantiations:             12,345
Memory used:               512000K
Parse time:                  1.25s
Check time:                 850ms
Total time:                  2.50s
`);
    expect(parsed).toEqual({
      files: 2345,
      linesOfTypeScript: 98765,
      identifiers: 120000,
      symbols: 80000,
      types: 45000,
      instantiations: 12345,
      memoryBytes: 512000 * 1024,
      parseSeconds: 1.25,
      checkSeconds: 0.85,
      totalSeconds: 2.5,
    });
  });

  it('parses macOS /usr/bin/time -lp output', () => {
    expect(
      parseTimeOutput(`
        2.51 real
        4.20 user
        0.31 sys
        123456789 maximum resident set size
        42 page reclaims
      `)
    ).toEqual({
      realSeconds: 2.51,
      userSeconds: 4.2,
      systemSeconds: 0.31,
      peakMemoryBytes: 123456789,
    });
  });

  it('parses GNU /usr/bin/time -v output', () => {
    expect(
      parseTimeOutput(`
        User time (seconds): 4.20
        System time (seconds): 0.31
        Elapsed (wall clock) time (h:mm:ss or m:ss): 1:02.50
        Maximum resident set size (kbytes): 512000
      `)
    ).toEqual({
      realSeconds: 62.5,
      userSeconds: 4.2,
      systemSeconds: 0.31,
      peakMemoryBytes: 512000 * 1024,
    });
  });

  it('parses label-first macOS time output', () => {
    expect(
      parseTimeOutput(`
        real 2.51
        user 4.20
        sys 0.31
        123456789 maximum resident set size
      `)
    ).toEqual({
      realSeconds: 2.51,
      userSeconds: 4.2,
      systemSeconds: 0.31,
      peakMemoryBytes: 123456789,
    });
  });
});

describe('typecheck performance aggregation and ratchet', () => {
  it('aggregates duration, peak memory, and CPU samples for a scenario', () => {
    const aggregate = aggregateScenarioResults([
      {
        durationMs: 100,
        peakMemoryBytes: 1000,
        cpuUtilization: 0.5,
        cacheHitRate: 0,
      },
      {
        durationMs: 120,
        peakMemoryBytes: 1500,
        cpuUtilization: 0.7,
        cacheHitRate: 0.5,
      },
      {
        durationMs: 110,
        peakMemoryBytes: 1200,
        cpuUtilization: 0.6,
        cacheHitRate: 1,
      },
    ]);
    expect(aggregate.sampleCount).toBe(3);
    expect(aggregate.durationMs).toMatchObject({
      p50: 110,
      p95: 120,
      mean: 110,
    });
    expect(aggregate.peakMemoryBytes).toBe(1500);
    expect(aggregate.cpuUtilization.mean).toBeCloseTo(0.6);
    expect(aggregate.cacheHitRate.mean).toBeCloseTo(0.5);
  });

  it('accepts only complete, internally consistent historical scenarios', () => {
    const scenario = {
      name: 'cold-full',
      samples: Array.from({ length: 10 }, (_, index) => ({
        durationMs: 100 + index,
      })),
      aggregate: { durationMs: { p95: 109 } },
    };
    const allowed = new Set(['cold-full']);
    expect(isValidHistoricalScenario(scenario, allowed)).toBe(true);
    expect(
      isValidHistoricalScenario({ ...scenario, name: 'forged' }, allowed)
    ).toBe(false);
    expect(
      isValidHistoricalScenario(
        { ...scenario, aggregate: { durationMs: { p95: 999 } } },
        allowed
      )
    ).toBe(false);
    expect(
      isValidHistoricalScenario(
        { ...scenario, samples: scenario.samples.slice(0, 9) },
        allowed
      )
    ).toBe(false);
  });

  it('fails closed when required resource telemetry is missing', () => {
    const targets = {
      maximumPackageShare: 0.3,
      maximumMemoryFraction: 0.75,
      maximumCoefficientOfVariation: 0.15,
    };
    expect(
      evaluatePerformanceConstraints({
        coefficientOfVariation: 0.1,
        packages: {},
        peakMemoryBytes: null,
        memoryLimitBytes: 1000,
        targets,
        requiresPackageTelemetry: true,
      })
    ).toMatchObject({
      packageTelemetryPresent: false,
      packageSharePassed: false,
      memoryTelemetryPresent: false,
      memoryPassed: false,
    });
    expect(
      evaluatePerformanceConstraints({
        coefficientOfVariation: 0.1,
        packages: { cachedNoise: { share: 1 } },
        peakMemoryBytes: 500,
        memoryLimitBytes: 1000,
        targets,
        requiresPackageTelemetry: false,
      })
    ).toMatchObject({ packageSharePassed: true, memoryPassed: true });
  });

  it('fails closed when any measured sample is missing telemetry', () => {
    const result = evaluatePerformanceConstraints({
      coefficientOfVariation: 0.1,
      packages: { '@jovie/web': { share: 0.2 } },
      peakMemoryBytes: 500,
      memoryLimitBytes: 1000,
      targets: {
        maximumPackageShare: 0.3,
        maximumMemoryFraction: 0.75,
        maximumCoefficientOfVariation: 0.15,
      },
      requiresPackageTelemetry: true,
      expectedSamples: 10,
      packageTelemetrySamples: 9,
      memoryTelemetrySamples: 9,
    });
    expect(result).toMatchObject({
      packageTelemetryPresent: false,
      packageTelemetrySamples: 9,
      packageSharePassed: false,
      memoryTelemetryPresent: false,
      memoryTelemetrySamples: 9,
      memoryPassed: false,
    });
  });

  it('warns above 10% and fails above 20% only with three samples', () => {
    expect(
      evaluateRatchet({ samples: [111], baseline: 100, absoluteTarget: 200 })
        .status
    ).toBe('warn');
    expect(
      evaluateRatchet({
        samples: [121, 121],
        baseline: 100,
        absoluteTarget: 200,
      }).status
    ).toBe('warn');
    expect(
      evaluateRatchet({
        samples: [121, 121, 121],
        baseline: 100,
        absoluteTarget: 200,
      })
    ).toMatchObject({ status: 'fail', reasons: ['sustained-regression'] });
  });

  it('allows rolling history to tighten but never loosen the baseline', () => {
    expect(selectRatchetBaseline(100, 90)).toBe(90);
    expect(selectRatchetBaseline(100, 110)).toBe(100);
    expect(selectRatchetBaseline(100, undefined)).toBe(100);
  });

  it('fails immediately only when the absolute target is exceeded by more than 25%', () => {
    expect(
      evaluateRatchet({ samples: [125], baseline: 125, absoluteTarget: 100 })
        .status
    ).toBe('pass');
    expect(
      evaluateRatchet({
        samples: [125.01],
        baseline: 125.01,
        absoluteTarget: 100,
      })
    ).toMatchObject({
      status: 'fail',
      reasons: ['absolute-target-exceeded'],
    });
  });

  it('does not warn at the exact regression thresholds', () => {
    expect(
      evaluateRatchet({ samples: [110], baseline: 100, absoluteTarget: 200 })
        .status
    ).toBe('pass');
    expect(
      evaluateRatchet({
        samples: [120, 120, 120],
        baseline: 100,
        absoluteTarget: 200,
      }).status
    ).toBe('warn');
  });
});
