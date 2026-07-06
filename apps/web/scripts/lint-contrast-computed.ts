#!/usr/bin/env tsx
/**
 * Computed-contrast gate CLI (JOV #12012).
 *
 * The regex contrast-ratchet (scripts/lint-contrast-ratchet.mjs) is a fast
 * pre-filter counting raw-color class usage; it cannot tell whether an
 * actual foreground token clears WCAG AA against an actual background
 * token. This gate resolves the token pairs declared in
 * contrast-pairs.config.json against styles/design-system.css +
 * styles/linear-tokens.css (light + dark themes) and computes real
 * WCAG 2.1 contrast ratios via lib/a11y-gates/contrast-engine.ts.
 *
 * Thresholds (WCAG 2.1 AA): 4.5:1 normal text, 3.0:1 large text/UI.
 * Pairs that cannot be statically resolved (color-mix, …) warn and skip
 * unless --strict.
 *
 * Usage:
 *   pnpm --filter web run lint:contrast-computed            # check
 *   tsx scripts/lint-contrast-computed.ts --verbose         # print ratios
 *   tsx scripts/lint-contrast-computed.ts --strict          # warnings fail
 *
 * Exit 0 = all resolvable pairs meet their threshold. Exit 1 = failure.
 * Merge-gate twin: tests/unit/design-system/computed-contrast.test.ts.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultCssFiles,
  loadPairsConfig,
  loadThemeTablesFromFiles,
  runContrastChecks,
} from '../lib/a11y-gates/contrast-engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function main(): void {
  const strict = process.argv.includes('--strict');
  const verbose = process.argv.includes('--verbose');

  const tables = loadThemeTablesFromFiles(defaultCssFiles(projectRoot));
  const pairs = loadPairsConfig(
    join(projectRoot, 'contrast-pairs.config.json')
  );
  const { failures, warnings, passes } = runContrastChecks(pairs, tables);

  console.log(
    `[contrast-computed] Checked ${passes.length + failures.length} resolvable pair-theme combinations (${warnings.length} skipped)`
  );

  if (verbose) {
    for (const p of passes) {
      console.log(
        `[contrast-computed]   ✓ ${p.name} [${p.theme}] — ${p.ratio?.toFixed(2)}:1 (min ${p.minRatio}:1)`
      );
    }
  }

  for (const w of warnings) {
    console.warn(
      `[contrast-computed]   ⚠ ${w.name} [${w.theme}] skipped — ${w.detail}`
    );
  }

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(
        `[contrast-computed] ✗ ${f.name} [${f.theme}]: ${f.ratio?.toFixed(2)}:1 < required ${f.minRatio}:1\n` +
          `    fg ${f.fg} on bg ${f.bg} fails WCAG AA. Adjust the token value\n` +
          `    or remove the pair from contrast-pairs.config.json with review.`
      );
    }
    process.exit(1);
  }

  if (strict && warnings.length > 0) {
    console.error(
      `[contrast-computed] ✗ --strict: ${warnings.length} unresolvable pair(s)`
    );
    process.exit(1);
  }

  console.log('[contrast-computed] ✓ All resolvable token pairs meet WCAG AA');
}

main();
