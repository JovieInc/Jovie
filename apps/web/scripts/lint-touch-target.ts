#!/usr/bin/env tsx
/**
 * Touch-target ratchet CLI (JOV #12012, WCAG 2.5.5 / Apple HIG 44pt).
 *
 * Counts interactive elements (`<button>`, `<a>`, role="button") in
 * components/ and app/ declaring explicit sub-44px height utilities
 * without a ≥44px rescue on the same element
 * (engine: lib/a11y-gates/touch-target-engine.ts).
 *
 * Baseline ratchet: the count in touch-target-ratchet.baseline.json may
 * only go DOWN. New sub-44px interactive elements fail CI; fixing them
 * lets you lower the baseline with --update.
 *
 * Runtime complement: axe `target-size` on rendered stories lands with the
 * Storybook+axe gate (#12008); this is the deterministic zero-render half.
 *
 * Usage:
 *   pnpm --filter web run lint:touch-target            # check only
 *   tsx scripts/lint-touch-target.ts --update          # lower the baseline
 *   tsx scripts/lint-touch-target.ts --list            # print violations
 *
 * Exit 0 = count ≤ baseline. Exit 1 = regression.
 * Merge-gate twin: tests/unit/design-system/touch-target-ratchet.test.ts.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countViolations } from '../lib/a11y-gates/touch-target-engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const BASELINE_PATH = join(projectRoot, 'touch-target-ratchet.baseline.json');

function main(): void {
  const isUpdate = process.argv.includes('--update');
  const isList = process.argv.includes('--list');

  const violations = countViolations(projectRoot);
  const count = violations.length;

  if (isList) {
    for (const v of violations) {
      console.log(`  ${v.file}:${v.line}  ${v.tag.replace(/\s+/g, ' ')}`);
    }
  }

  if (isUpdate || !existsSync(BASELINE_PATH)) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          _comment:
            'Touch-target ratchet baseline — interactive elements with explicit sub-44px heights (scripts/lint-touch-target.ts). Ratchet only goes down: fix elements (min 44px hit area, WCAG 2.5.5), then run `pnpm --filter web run lint:touch-target -- --update`.',
          count,
        },
        null,
        2
      )}\n`
    );
    console.log(
      `[touch-target] ✓ Baseline ${isUpdate ? 'updated' : 'seeded'} at ${count} → ${BASELINE_PATH}`
    );
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
    count: number;
  };
  console.log(
    `[touch-target] ${count} sub-44px interactive elements (baseline: ${baseline.count})`
  );

  if (count > baseline.count) {
    console.error(
      `[touch-target] ✗ Regression: ${count} > baseline ${baseline.count}\n` +
        '  New interactive elements with sub-44px hit areas introduced.\n' +
        '  Interactive controls need a minimum 44px touch target (WCAG 2.5.5).\n' +
        '  Fix: use h-11+ (44px), add min-h-11, or expand the hit area with padding.\n' +
        '  Run `tsx scripts/lint-touch-target.ts --list` to locate them.'
    );
    process.exit(1);
  }

  if (count < baseline.count) {
    console.log(
      '[touch-target] ✓ Count improved — run with --update to lower the baseline'
    );
  } else {
    console.log('[touch-target] ✓ No regressions detected');
  }
}

main();
