#!/usr/bin/env tsx
/**
 * Smooth surface regression ratchet — extends the Smooth harness / budgets-guard
 * controller (not a second controller). Compares a measured summary to committed
 * baselines under docs/performance/smooth/baselines and fails when a metric
 * worsens beyond measured noise. Lighthouse stays non-blocking; this gate does.
 *
 * Update baselines after intentional improvements:
 *   pnpm --filter @jovie/web perf:smooth:baseline:write -- --base-url <isolated>
 * That path only tightens (or adds) cells. Raising a median requires
 * `--allow-raise` after remeasure on an isolated preview (never production).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type SmoothPlatform,
  type SmoothSurfaceId,
  smoothBaselineFileName,
} from './performance-smooth-manifest';
import type {
  SmoothBaselineSummary,
  SmoothSurfaceBaseline,
} from './performance-smooth-types';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');

export const SMOOTH_BASELINE_DIR = resolve(
  repoRoot,
  'docs/performance/smooth/baselines'
);

/** Public cells with committed baselines; auth surfaces stay pending. */
export const SMOOTH_RATCHET_PUBLIC_SURFACES = [
  'homepage',
  'artist-profile',
  'onboarding-start',
] as const satisfies readonly SmoothSurfaceId[];

export type SmoothRatchetMetric =
  | 'cls'
  | 'lcpMs'
  | 'inpMs'
  | 'fullPageReloads'
  | 'duplicateFetches'
  | 'flickerEvents'
  | 'hydrationWarnings';

/**
 * Noise band from Smooth n=3 medians + Lighthouse relative-budget precedent.
 * Allowed regression = max(absolute, |baseline| * relative). Count metrics use
 * absolute only (any integer increase fails).
 */
export const SMOOTH_NOISE_POLICY = Object.freeze({
  cls: Object.freeze({ relativeTolerance: 0.25, absoluteTolerance: 0.005 }),
  lcpMs: Object.freeze({ relativeTolerance: 0.08, absoluteTolerance: 150 }),
  inpMs: Object.freeze({ relativeTolerance: 0.25, absoluteTolerance: 50 }),
  fullPageReloads: Object.freeze({
    relativeTolerance: 0,
    absoluteTolerance: 0,
  }),
  duplicateFetches: Object.freeze({
    relativeTolerance: 0,
    absoluteTolerance: 0,
  }),
  flickerEvents: Object.freeze({ relativeTolerance: 0, absoluteTolerance: 0 }),
  hydrationWarnings: Object.freeze({
    relativeTolerance: 0,
    absoluteTolerance: 0,
  }),
}) satisfies Record<
  SmoothRatchetMetric,
  { relativeTolerance: number; absoluteTolerance: number }
>;

export const SMOOTH_RATCHET_METRICS = Object.keys(
  SMOOTH_NOISE_POLICY
) as SmoothRatchetMetric[];

export interface SmoothMetricVerdict {
  readonly metric: SmoothRatchetMetric;
  readonly baseline: number | null;
  readonly measured: number | null;
  readonly allowed: number;
  readonly regression: number;
  readonly status: 'pass' | 'fail' | 'skip';
  readonly detail: string;
}

export interface SmoothSurfaceVerdict {
  readonly surfaceId: SmoothSurfaceId;
  readonly platform: SmoothPlatform;
  readonly status: 'pass' | 'fail' | 'skip';
  readonly metrics: readonly SmoothMetricVerdict[];
  readonly detail: string;
}

export interface SmoothRatchetReport {
  readonly schema: 'jovie-smooth-ratchet/v1';
  readonly baselineDir: string;
  readonly status: 'pass' | 'fail';
  readonly surfaces: readonly SmoothSurfaceVerdict[];
  readonly failures: readonly string[];
}

export type CheckedInSmoothBaseline = Omit<SmoothSurfaceBaseline, 'samples'>;

export function allowedRegression(
  metric: SmoothRatchetMetric,
  baseline: number
) {
  const policy = SMOOTH_NOISE_POLICY[metric];
  return Math.max(
    Math.abs(baseline) * policy.relativeTolerance,
    policy.absoluteTolerance
  );
}

function readMetric(
  baseline: Pick<SmoothSurfaceBaseline, 'median'>,
  metric: SmoothRatchetMetric
): number | null {
  const value = baseline.median[metric];
  if (value == null) return null;
  return value;
}

export function compareMetric(options: {
  readonly metric: SmoothRatchetMetric;
  readonly baseline: number | null;
  readonly measured: number | null;
}): SmoothMetricVerdict {
  const { metric, baseline, measured } = options;
  if (baseline == null && measured == null) {
    return {
      metric,
      baseline,
      measured,
      allowed: 0,
      regression: 0,
      status: 'skip',
      detail: 'both null',
    };
  }
  if (baseline == null) {
    return {
      metric,
      baseline,
      measured,
      allowed: 0,
      regression: 0,
      status: 'fail',
      detail: 'missing committed baseline value',
    };
  }
  if (measured == null) {
    // INP can be null when no interaction fired; treat as no regression.
    if (metric === 'inpMs') {
      return {
        metric,
        baseline,
        measured,
        allowed: allowedRegression(metric, baseline),
        regression: 0,
        status: 'skip',
        detail: 'measured INP unavailable',
      };
    }
    return {
      metric,
      baseline,
      measured,
      allowed: 0,
      regression: 0,
      status: 'fail',
      detail: 'missing measured value',
    };
  }
  const regression = measured - baseline;
  const allowed = allowedRegression(metric, baseline);
  if (regression > allowed) {
    return {
      metric,
      baseline,
      measured,
      allowed,
      regression,
      status: 'fail',
      detail: `+${formatDelta(metric, regression)} over noise (±${formatDelta(metric, allowed)})`,
    };
  }
  return {
    metric,
    baseline,
    measured,
    allowed,
    regression,
    status: 'pass',
    detail:
      regression <= 0
        ? 'improved or flat'
        : `within noise (+${formatDelta(metric, regression)} ≤ ${formatDelta(metric, allowed)})`,
  };
}

function formatDelta(metric: SmoothRatchetMetric, value: number) {
  if (metric === 'cls') return value.toFixed(3);
  if (metric === 'lcpMs' || metric === 'inpMs') return `${Math.round(value)}ms`;
  return String(value);
}

export function compareSurface(options: {
  readonly committed: CheckedInSmoothBaseline;
  readonly measured: Pick<
    SmoothSurfaceBaseline,
    'surfaceId' | 'platform' | 'median'
  >;
}): SmoothSurfaceVerdict {
  const { committed, measured } = options;
  const metrics = SMOOTH_RATCHET_METRICS.map(metric =>
    compareMetric({
      metric,
      baseline: readMetric(committed, metric),
      measured: readMetric(measured, metric),
    })
  );
  const failed = metrics.filter(entry => entry.status === 'fail');
  if (failed.length > 0) {
    return {
      surfaceId: measured.surfaceId,
      platform: measured.platform,
      status: 'fail',
      metrics,
      detail: failed.map(entry => `${entry.metric} ${entry.detail}`).join('; '),
    };
  }
  return {
    surfaceId: measured.surfaceId,
    platform: measured.platform,
    status: 'pass',
    metrics,
    detail: 'within noise',
  };
}

export function loadCommittedBaselines(
  baselineDir = SMOOTH_BASELINE_DIR
): CheckedInSmoothBaseline[] {
  if (!existsSync(baselineDir)) {
    throw new Error(
      `Smooth baseline dir missing: ${baselineDir}. Commit public-surface baselines first.`
    );
  }
  const files = readdirSync(baselineDir).filter(
    name => name.endsWith('.json') && name !== 'summary.json'
  );
  return files.map(name => {
    const raw = JSON.parse(
      readFileSync(join(baselineDir, name), 'utf8')
    ) as CheckedInSmoothBaseline;
    if (raw.schema !== 'jovie-smooth-baseline/v1') {
      throw new Error(`Unexpected Smooth baseline schema in ${name}`);
    }
    return raw;
  });
}

export function assertPublicBaselinesPresent(
  baselines: readonly CheckedInSmoothBaseline[]
) {
  const missing: string[] = [];
  for (const surfaceId of SMOOTH_RATCHET_PUBLIC_SURFACES) {
    for (const platform of ['desktop', 'mobile'] as const) {
      const found = baselines.some(
        entry => entry.surfaceId === surfaceId && entry.platform === platform
      );
      if (!found) missing.push(`${surfaceId}.${platform}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing Smooth public baselines: ${missing.join(', ')}. Run perf:smooth:baseline:write on an isolated preview.`
    );
  }
}

/**
 * Shrink-only writer rule: head may only improve (or stay within noise of)
 * an existing committed cell unless allowRaise is set.
 */
export function findBaselineRaises(options: {
  readonly previous: readonly CheckedInSmoothBaseline[];
  readonly next: readonly CheckedInSmoothBaseline[];
  readonly allowRaise?: boolean;
}) {
  if (options.allowRaise) return [];
  const raises: string[] = [];
  for (const next of options.next) {
    const previous = options.previous.find(
      entry =>
        entry.surfaceId === next.surfaceId && entry.platform === next.platform
    );
    if (!previous) continue;
    for (const metric of SMOOTH_RATCHET_METRICS) {
      const verdict = compareMetric({
        metric,
        baseline: readMetric(previous, metric),
        measured: readMetric(next, metric),
      });
      if (verdict.status === 'fail') {
        raises.push(
          `${next.surfaceId}/${next.platform} ${metric}: ${verdict.detail}`
        );
      }
    }
  }
  return raises;
}

export function evaluateSmoothRatchet(options: {
  readonly measured: SmoothBaselineSummary;
  readonly committed?: readonly CheckedInSmoothBaseline[];
  readonly baselineDir?: string;
  /** When loading from disk, require all public cells. Off for planted unit fixtures. */
  readonly requirePublicInventory?: boolean;
}): SmoothRatchetReport {
  const fromDisk = options.committed == null;
  const committed =
    options.committed ?? loadCommittedBaselines(options.baselineDir);
  if (options.requirePublicInventory ?? fromDisk) {
    assertPublicBaselinesPresent(committed);
  }

  const surfaces: SmoothSurfaceVerdict[] = [];
  for (const measured of options.measured.surfaces) {
    const match = committed.find(
      entry =>
        entry.surfaceId === measured.surfaceId &&
        entry.platform === measured.platform
    );
    if (!match) {
      surfaces.push({
        surfaceId: measured.surfaceId,
        platform: measured.platform,
        status: 'skip',
        metrics: [],
        detail: 'no committed baseline (auth pending or new surface)',
      });
      continue;
    }
    surfaces.push(compareSurface({ committed: match, measured }));
  }

  const failures = surfaces
    .filter(entry => entry.status === 'fail')
    .map(entry => `${entry.surfaceId}/${entry.platform}: ${entry.detail}`);

  return {
    schema: 'jovie-smooth-ratchet/v1',
    baselineDir: options.baselineDir ?? SMOOTH_BASELINE_DIR,
    status: failures.length > 0 ? 'fail' : 'pass',
    surfaces,
    failures,
  };
}

export function formatSmoothRatchetReport(report: SmoothRatchetReport) {
  const lines = [
    `Smooth ratchet: ${report.status.toUpperCase()}`,
    `Baselines: ${report.baselineDir}`,
  ];
  for (const surface of report.surfaces) {
    lines.push(
      `  ${surface.surfaceId}/${surface.platform}: ${surface.status} — ${surface.detail}`
    );
  }
  if (report.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of report.failures) lines.push(`  - ${failure}`);
  }
  return `${lines.join('\n')}\n`;
}

export function parseSmoothRatchetCliArgs(args: readonly string[]) {
  let baselineDir = SMOOTH_BASELINE_DIR;
  let measuredPath: string | undefined;
  let check = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') {
      check = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--baseline-dir') {
      const value = args[index + 1];
      if (!value) throw new TypeError('Missing value for --baseline-dir');
      baselineDir = isAbsolute(value) ? value : resolve(repoRoot, value);
      index += 1;
      continue;
    }
    if (arg === '--measured') {
      const value = args[index + 1];
      if (!value) throw new TypeError('Missing value for --measured');
      measuredPath = isAbsolute(value) ? value : resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown argument: ${arg}`);
  }
  return { baselineDir, measuredPath, check, json };
}

function loadMeasuredSummary(path: string): SmoothBaselineSummary {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as SmoothBaselineSummary;
  if (raw.schema !== 'jovie-smooth-baseline-summary/v1') {
    throw new Error(`Unexpected measured summary schema in ${path}`);
  }
  return raw;
}

export function runSmoothRatchetCli(args: readonly string[]) {
  const options = parseSmoothRatchetCliArgs(args);
  const committed = loadCommittedBaselines(options.baselineDir);
  assertPublicBaselinesPresent(committed);

  if (options.check && !options.measuredPath) {
    const expected = SMOOTH_RATCHET_PUBLIC_SURFACES.flatMap(surfaceId =>
      (['desktop', 'mobile'] as const).map(platform =>
        smoothBaselineFileName(surfaceId, platform)
      )
    );
    const message = `Smooth baselines OK (${expected.length} public cells in ${options.baselineDir})`;
    if (options.json) {
      return {
        code: 0 as const,
        stdout: `${JSON.stringify({ status: 'pass', baselines: expected }, null, 2)}\n`,
        stderr: `${message}\n`,
      };
    }
    return { code: 0 as const, stdout: `${message}\n`, stderr: '' };
  }

  if (!options.measuredPath) {
    throw new TypeError(
      'Pass --measured <summary.json> to compare, or --check to validate committed baselines.'
    );
  }

  const report = evaluateSmoothRatchet({
    measured: loadMeasuredSummary(options.measuredPath),
    committed,
    baselineDir: options.baselineDir,
  });
  const text = formatSmoothRatchetReport(report);
  if (options.json) {
    return {
      code: report.status === 'pass' ? (0 as const) : (1 as const),
      stdout: `${JSON.stringify(report, null, 2)}\n`,
      stderr: text,
    };
  }
  return {
    code: report.status === 'pass' ? (0 as const) : (1 as const),
    stdout: text,
    stderr: '',
  };
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  try {
    const result = runSmoothRatchetCli(process.argv.slice(2));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
