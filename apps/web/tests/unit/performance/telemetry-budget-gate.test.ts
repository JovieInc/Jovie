import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateTelemetryBudgets,
  isTelemetryChunk,
  loadTelemetryBudgets,
  measureTelemetryContribution,
} from '@/scripts/compare-chunks';

function repoRoot(): string {
  // tests/unit/performance -> unit -> tests -> apps/web -> repo root.
  return join(import.meta.dirname, '..', '..', '..', '..', '..');
}

function budgetPath(): string {
  return join(repoRoot(), 'docs/performance/telemetry-budgets.json');
}

describe('telemetry chunk classification (JOV-6585)', () => {
  it('classifies Turbopack-sanitized chunk names (separators replaced by underscores)', () => {
    expect(
      isTelemetryChunk(
        'static/chunks/[root-of-the-server]__3f2ab_lib_tracking_navigation_telemetry_ts_1a2b3c._.js'
      )
    ).toBe(true);
    expect(
      isTelemetryChunk(
        'static/chunks/[root-of-the-server]__77ab_node_modules_web_vitals_dist_web_vitals_js_5d6e7f._.js'
      )
    ).toBe(true);
    expect(
      isTelemetryChunk(
        'static/chunks/[root-of-the-server]__0k1_lib_analytics_ts_9z8y7x._.js'
      )
    ).toBe(true);
  });

  it('never classifies non-telemetry chunks', () => {
    expect(
      isTelemetryChunk(
        'static/chunks/[root-of-the-server]__0k1_lib_db_schema_profiles_ts_0aa1bb._.js'
      )
    ).toBe(false);
    expect(isTelemetryChunk('static/chunks/main-framework-abc123.js')).toBe(
      false
    );
    expect(isTelemetryChunk('static/chunks/pages/index-b21e2d.js')).toBe(false);
  });
});

describe('telemetry contribution measurement (JOV-6585)', () => {
  it('sums raw and gzip bytes over telemetry chunks only, deduplicated by chunk path', () => {
    const telemetryChunk = Buffer.from('/*telemetry*/'.repeat(100));
    const plainChunk = Buffer.from('/*page*/'.repeat(100));
    const contribution = measureTelemetryContribution(
      [
        'static/chunks/lib_tracking_foo_ts_1._.js',
        'static/chunks/lib_tracking_foo_ts_1._.js',
        'static/chunks/lib_analytics_ts_2._.js',
        'static/chunks/main-framework-abc.js',
      ],
      chunkPath =>
        chunkPath === 'static/chunks/main-framework-abc.js'
          ? plainChunk
          : telemetryChunk
    );

    expect(Object.keys(contribution.chunks)).toHaveLength(2);
    expect(contribution.rawBytes).toBe(telemetryChunk.length * 2);
    expect(contribution.gzipBytes).toBeGreaterThan(0);
  });

  it('counts zero when a telemetry chunk file is missing from the build output', () => {
    const contribution = measureTelemetryContribution(
      ['static/chunks/lib_tracking_missing_ts_1._.js'],
      () => null
    );
    expect(contribution.rawBytes).toBe(0);
    expect(contribution.gzipBytes).toBe(0);
    expect(Object.keys(contribution.chunks)).toHaveLength(0);
  });
});

describe('telemetry budget gate (JOV-6585)', () => {
  it('loads committed budgets with a documented Jovie-measured baseline and rationale', () => {
    const budgets = loadTelemetryBudgets(budgetPath());
    expect(budgets.limits.gzip_bytes).toBeGreaterThan(0);
    expect(budgets.limits.raw_bytes).toBeGreaterThan(0);
    expect(budgets.rationale).toContain('repository');
    expect(typeof budgets.baseline.measured_gzip_bytes).toBe('number');
    expect(typeof budgets.baseline.measured_raw_bytes).toBe('number');
    // Raw limit must exceed the gzip limit (compression shrinks every chunk).
    expect(budgets.limits.raw_bytes).toBeGreaterThan(budgets.limits.gzip_bytes);
  });

  it('fails when a deliberately bloated telemetry fixture exceeds the limits', () => {
    const budgets = loadTelemetryBudgets(budgetPath());
    const bloated = Buffer.from('x'.repeat(budgets.limits.raw_bytes + 1));
    const contribution = measureTelemetryContribution(
      ['static/chunks/lib_tracking_bloat_ts_1._.js'],
      () => bloated
    );
    const result = evaluateTelemetryBudgets(contribution, budgets);
    expect(result.passed).toBe(false);
    expect(result.violations.join('\n')).toContain('uncompressed');
  });

  it('fails when gzip alone exceeds its limit even when raw fits', () => {
    const budgets = loadTelemetryBudgets(budgetPath());
    // Incompressible bytes sit between the gzip limit and the raw limit, so
    // only the gzip gate can fail.
    const highEntropy = randomBytes(budgets.limits.gzip_bytes + 1);
    const contribution = measureTelemetryContribution(
      ['static/chunks/lib_tracking_entropy_ts_1._.js'],
      () => highEntropy
    );
    const result = evaluateTelemetryBudgets(contribution, budgets);
    expect(result.rawBytes).toBeLessThanOrEqual(budgets.limits.raw_bytes);
    expect(result.passed).toBe(false);
    expect(result.violations.join('\n')).toContain('gzip');
  });

  it('passes a realistic telemetry contribution within the committed limits', () => {
    const budgets = loadTelemetryBudgets(budgetPath());
    const contribution = measureTelemetryContribution(
      ['static/chunks/lib_tracking_small_ts_1._.js'],
      () => Buffer.from('/*realistic telemetry chunk*/'.repeat(100))
    );
    const result = evaluateTelemetryBudgets(contribution, budgets);
    expect(result.passed).toBe(true);
  });

  it('fails closed on a missing budget file (no skipped check can pass)', () => {
    expect(() =>
      loadTelemetryBudgets(join(tmpdir(), 'jov-6585-nope', 'nope.json'))
    ).toThrow(/missing/);
  });

  it('fails closed on a malformed budget file', () => {
    const root = mkdtempSync(join(tmpdir(), 'jov-6585-malformed-'));
    const malformed = join(root, 'telemetry-budgets.json');
    writeFileSync(malformed, '{"limits": {"gzip_bytes": 1}}');
    try {
      expect(() => loadTelemetryBudgets(malformed)).toThrow(/malformed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * CLI end-to-end: the committed script exits non-zero when the build manifest
 * is missing (fail-closed) — a skipped check can never yield a passing receipt.
 * Runs the real script via Node type-stripping; no pnpm install required.
 */
describe('compare-chunks CLI gate (JOV-6585)', () => {
  it('exits 1 without a build manifest instead of silently passing', () => {
    const root = repoRoot();
    const script = join(root, 'apps/web/scripts/compare-chunks.ts');
    expect(existsSync(script)).toBe(true);
    const result = spawnSync('node', ['--experimental-strip-types', script], {
      cwd: join(root, 'apps/web'),
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status).toBe(1);
    expect(output).toContain('No build output found');
  }, 60_000);
});
