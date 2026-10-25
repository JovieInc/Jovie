/**
 * Throttled-mobile perf gate for public surfaces.
 *
 * Reads Lighthouse result JSON files (the mobile, throttled runs produced by
 * scripts/run-public-lighthouse.ts / lhci) and enforces the lock_down budgets
 * in public-surface-quality.baseline.json via lib/quality/public-surface-checks.
 *
 *   tsx scripts/public-surface-perf-gate.ts <lhr.json> [<lhr.json> ...]
 *
 * Exits 1 on any budget violation. Extends the existing Lighthouse machinery
 * (budgets are checked on its output) rather than re-implementing throttling.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  evaluatePerfBudget,
  formatViolations,
  type LighthouseResultLike,
  type PerfBudgets,
  perfMetricsFromLighthouse,
  validatePerfBaseline,
} from '../lib/quality/public-surface-checks';

const baseline = JSON.parse(
  readFileSync(
    new URL('../public-surface-quality.baseline.json', import.meta.url),
    'utf8'
  )
) as { perf: PerfBudgets };

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: public-surface-perf-gate.ts <lhr.json> ...');
  process.exit(2);
}

const violations = validatePerfBaseline(baseline.perf);
for (const file of files) {
  const lhr = JSON.parse(readFileSync(file, 'utf8')) as LighthouseResultLike;
  violations.push(
    ...evaluatePerfBudget(perfMetricsFromLighthouse(lhr), baseline.perf, file)
  );
}

if (violations.length > 0) {
  console.error(formatViolations(violations));
  process.exit(1);
}
console.log(
  `public-surface perf gate: ${files.length} result(s) within budget`
);
