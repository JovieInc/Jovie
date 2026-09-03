import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * D4 — native second-spacing-scale ratchet (JOV-5865).
 *
 * Runs scripts/invariants/native-spacing-scale.mjs over apps/ios Swift and
 * apps/desktop/src inline CSS so the design-system lane carries the native
 * surfaces too. Shrink-only: growth of off-grid literals (10, 11, 13, 14, 18…)
 * fails; remaining count never does. Baseline lives beside the script.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts/invariants/native-spacing-scale.mjs');
const BASELINE = join(
  REPO_ROOT,
  'scripts/invariants/native-spacing-scale.baseline.json'
);

interface NativeSpacingReport {
  readonly measured: Record<
    string,
    { readonly conservative: number; readonly strict: number }
  >;
  readonly baseline: {
    readonly armed: {
      readonly conservative: boolean;
      readonly strict: boolean;
    };
    readonly surfaces: Record<
      string,
      { readonly conservative: number; readonly strict: number }
    >;
  } | null;
  readonly verdict: {
    readonly ok: boolean;
    readonly issues: readonly string[];
    readonly warnings: readonly string[];
  };
}

describe('native spacing-scale ratchet (iOS + Mac, shrink-only)', () => {
  it('keeps off-grid native spacing literals at or below the baseline', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(existsSync(BASELINE)).toBe(true);

    const run = spawnSync(process.execPath, [SCRIPT, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(run.error).toBeUndefined();

    const report = JSON.parse(run.stdout) as NativeSpacingReport;
    expect(report.baseline?.armed).toEqual({
      conservative: true,
      strict: false,
    });

    if (!report.verdict.ok) {
      expect.fail(
        `native spacing drift grew:\n${report.verdict.issues.join('\n')}\n` +
          'Snap Swift .padding/spacing and Mac CSS px literals to the 4px grid.'
      );
    }
    expect(run.status).toBe(0);

    for (const [surface, measured] of Object.entries(report.measured)) {
      const floor = report.baseline?.surfaces[surface];
      expect(floor, `${surface} baseline entry`).toBeDefined();
      expect(measured.conservative).toBeLessThanOrEqual(floor!.conservative);
    }
  }, 30_000);

  it('locks the baseline shape so the floor can only be lowered by hand', () => {
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
      surfaces: Record<string, { conservative: number; strict: number }>;
    };
    expect(Object.keys(baseline.surfaces).sort()).toEqual(['desktop', 'ios']);
    for (const floor of Object.values(baseline.surfaces)) {
      expect(Number.isInteger(floor.conservative)).toBe(true);
      expect(Number.isInteger(floor.strict)).toBe(true);
      expect(floor.conservative).toBeLessThanOrEqual(floor.strict);
    }
  });
});
