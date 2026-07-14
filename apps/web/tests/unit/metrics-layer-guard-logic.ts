import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Shared counting logic for the canonical-metrics-layer guard ratchet
 * (`analytics-metrics-layer-guard.test.ts`).
 *
 * Two violation classes are counted per file:
 *
 * 1. `tables` — references to raw analytics event tables (`click_events`,
 *    `daily_profile_views`, `notification_subscriptions`, and their Drizzle
 *    identifiers). New raw aggregates over these tables belong behind the
 *    canonical metrics layer (`lib/analytics/metrics.ts`) and its baselined
 *    query files — not in new handlers or components.
 *
 * 2. `rates` — ad-hoc percentage derivations of the shape `(a / b) * 100`
 *    (or the legacy `* 1000) / 10` one-decimal variant). Derived rates
 *    (CTR, capture rate, visitor share) must come from the derivation
 *    helpers in `lib/analytics/metrics.ts`.
 *
 * This module is imported by the vitest guard AND runnable directly with
 * `node` (type stripping) to seed/refresh the baseline, so the baseline and
 * the test can never diverge.
 */

export interface FileViolations {
  readonly tables: number;
  readonly rates: number;
}

export type ViolationMap = Record<string, FileViolations>;

const SOURCE_EXT = /\.(tsx|ts)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'coverage']);

/** The canonical layer itself — the one place formulas are allowed. */
const CANONICAL_LAYER = 'lib/analytics/metrics.ts';

/**
 * Sanctioned homes for raw analytics-table references: the Drizzle schema
 * definitions and the canonical query file that feeds the metrics layer.
 * These are exempt from the `tables` rule (but not the `rates` rule).
 */
const TABLE_RULE_EXEMPT = [
  /^lib\/db\/schema\//,
  /^lib\/db\/queries\/analytics\.ts$/,
];

const TABLE_TOKENS =
  /\b(clickEvents|click_events|dailyProfileViews|daily_profile_views|notificationSubscriptions|notification_subscriptions)\b/g;

// `(a / b) * 100` — a division whose closing paren is multiplied by 100.
const RATE_DERIVATION = /\/[^\n;]{0,80}?\)\s*\*\s*100\b/g;
// Legacy one-decimal variant: `Math.round(x * 1000) / 10`.
const RATE_DERIVATION_LEGACY = /\*\s*1000\s*\)\s*\/\s*10\b/g;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  // Dirent already carries the file type from the directory read. Avoiding a
  // separate statSync for every entry keeps this repository-wide guard bounded
  // when the shared runner's filesystem is under load.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (
      entry.isFile() &&
      SOURCE_EXT.test(entry.name) &&
      !/\.(test|spec|stories)\./.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

function countMatches(source: string, regex: RegExp): number {
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Count metrics-layer violations across `apps/web/{app,components,lib}`.
 * Returns a map of web-root-relative posix paths → violation counts,
 * including only files with at least one violation.
 */
export function countMetricsLayerViolations(webRoot: string): ViolationMap {
  const files: string[] = [];
  for (const dir of ['app', 'components', 'lib']) {
    walk(join(webRoot, dir), files);
  }

  const result: ViolationMap = {};
  for (const file of files) {
    const rel = relative(webRoot, file).split('\\').join('/');
    if (rel === CANONICAL_LAYER) continue;

    const source = readFileSync(file, 'utf8');
    const tableRuleExempt = TABLE_RULE_EXEMPT.some(re => re.test(rel));
    const tables = tableRuleExempt ? 0 : countMatches(source, TABLE_TOKENS);
    const rates =
      countMatches(source, RATE_DERIVATION) +
      countMatches(source, RATE_DERIVATION_LEGACY);

    if (tables > 0 || rates > 0) {
      result[rel] = { tables, rates };
    }
  }

  // Stable key order so the seeded baseline diffs cleanly.
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
  );
}
