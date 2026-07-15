import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  countMetricsLayerViolations,
  type ViolationMap,
} from './metrics-layer-guard-logic';

/**
 * Canonical-metrics-layer guard ratchet.
 *
 * `lib/analytics/metrics.ts` is the single source of truth for every
 * analytics metric definition and every derived rate (CTR, capture rate,
 * visitor share). This guard fails when a NEW raw analytics aggregate
 * (query over `click_events` / `daily_profile_views` /
 * `notification_subscriptions`) or a NEW ad-hoc `(a / b) * 100` rate
 * derivation is added outside that layer.
 *
 * Existing pre-layer call-sites are baselined in
 * `metrics-layer.baseline.json`; counts may only go DOWN (repo ratchet
 * convention — see arbitrary-values-ratchet). When you migrate a file onto
 * the canonical layer, lower or remove its baseline entry in the same PR.
 *
 * How to fix a failure:
 * - Need a new metric? Define it in `lib/analytics/metrics.ts`
 *   (CANONICAL_METRICS) and query it from a baselined query file
 *   (e.g. `lib/db/queries/analytics.ts`).
 * - Need a percentage? Import `computeRatePercent` / `computeCaptureRate` /
 *   `computeCtr` from `@/lib/analytics/metrics` instead of writing
 *   `(a / b) * 100` inline.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit → apps/web
const WEB_ROOT = join(__dirname, '..', '..');
const BASELINE_PATH = join(__dirname, 'metrics-layer.baseline.json');

describe('canonical metrics layer guard', () => {
  it('no new raw analytics aggregates or ad-hoc rate derivations outside lib/analytics/metrics.ts', () => {
    const current = countMetricsLayerViolations(WEB_ROOT);

    // Self-seed on first run so the baseline and counting logic can never
    // diverge. Commit the seeded file; CI compares against it.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(
          {
            note: 'Raw analytics-table references and inline (a / b) * 100 rate derivations outside lib/analytics/metrics.ts. Ratchet only goes down — lower entries when a PR migrates a file onto the canonical metrics layer.',
            files: current,
          },
          null,
          2
        )}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      files: ViolationMap;
    };

    const failures: string[] = [];

    for (const [file, counts] of Object.entries(current)) {
      const allowed = baseline.files[file] ?? { tables: 0, rates: 0 };
      if (counts.tables > allowed.tables) {
        failures.push(
          `${file}: raw analytics-table references rose to ${counts.tables} (baseline ${allowed.tables}). ` +
            'Query the metric through the canonical metrics layer (lib/analytics/metrics.ts) instead of adding a new raw aggregate.'
        );
      }
      if (counts.rates > allowed.rates) {
        failures.push(
          `${file}: inline rate derivations rose to ${counts.rates} (baseline ${allowed.rates}). ` +
            'Import computeRatePercent/computeCaptureRate/computeCtr from @/lib/analytics/metrics instead of computing (a / b) * 100 ad-hoc.'
        );
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('walks source directories without treating test files as violations', () => {
    const webRoot = mkdtempSync(join(tmpdir(), 'metrics-layer-guard-'));

    try {
      mkdirSync(join(webRoot, 'app', 'nested'), { recursive: true });
      mkdirSync(join(webRoot, 'components'), { recursive: true });
      mkdirSync(join(webRoot, 'lib', 'analytics'), { recursive: true });
      writeFileSync(
        join(webRoot, 'app', 'nested', 'route.ts'),
        'const raw = click_events; const rate = (clicks / views) * 100;\n'
      );
      writeFileSync(
        join(webRoot, 'components', 'ignored.test.tsx'),
        'const raw = click_events;\n'
      );
      writeFileSync(
        join(webRoot, 'lib', 'analytics', 'metrics.ts'),
        'const raw = click_events; const rate = (clicks / views) * 100;\n'
      );

      expect(countMetricsLayerViolations(webRoot)).toEqual({
        'app/nested/route.ts': { tables: 1, rates: 1 },
      });
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });
});
