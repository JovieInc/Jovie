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
 * Generated surface/state/status pairs use sRGB compositing. Unresolvable
 * pairs fail closed. Existing failures have per-pair floors in the shrink-only
 * contrast-computed.baseline.json; new or worsening failures block.
 *
 * Usage:
 *   pnpm --filter web run lint:contrast-computed            # check
 *   tsx scripts/lint-contrast-computed.ts --verbose         # print ratios
 *   tsx scripts/lint-contrast-computed.ts --update          # shrink baseline
 *
 * Exit 0 = no regressions or coverage loss. Exit 1 = failure.
 * Merge-gate twin: tests/unit/design-system/computed-contrast.test.ts.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  failureBaseline,
  loadContrastGate,
} from '../lib/a11y-gates/contrast-matrix';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const result = await loadContrastGate(projectRoot);
  const { failures, warnings, passes, errors } = result;

  console.log(
    `[contrast-computed] Checked ${passes.length + failures.length} pair-theme combinations; ${failures.length} below threshold; ${warnings.length} unresolvable`
  );

  if (verbose) {
    for (const p of passes) {
      console.log(
        `[contrast-computed]   ✓ ${p.name} [${p.theme}] — ${p.ratio?.toFixed(2)}:1 (min ${p.minRatio}:1)`
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[contrast-computed] ✗ ${error}`);
    process.exit(1);
  }

  // Only reached after regression checks: --update cannot add or worsen debt.
  if (process.argv.includes('--update')) {
    writeFileSync(
      join(projectRoot, 'contrast-computed.baseline.json'),
      `${JSON.stringify(failureBaseline(result), null, 2)}\n`
    );
  }
  console.log(
    `[contrast-computed] ✓ No regressions (${failures.length} baselined failures)`
  );
}

// tsx emits this script as CommonJS. Top-level await fails that transform
// (esbuild: "cjs" output format), so the ratchet never reaches the gate.
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[contrast-computed] ✗ ${message}`);
  process.exit(1);
});
