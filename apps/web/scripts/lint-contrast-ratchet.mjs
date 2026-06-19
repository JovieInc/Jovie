#!/usr/bin/env node
/**
 * Contrast ratchet guard — static source-file lint (JOV-11038).
 *
 * Counts hardcoded Tailwind color classes that cause black-on-black or
 * white-on-white contrast failures when the app renders in the opposite theme:
 *
 *   bareTextBlack — `text-black` without a `dark:text-*` counterpart on the
 *                   same source line.  In dark mode, black text on a dark
 *                   surface is invisible.
 *
 *   bareBgWhite   — `bg-white` without a `dark:bg-*` counterpart on the same
 *                   source line.  A bare white background in dark mode can
 *                   trap any dark text that was already on the surface.
 *
 * Rules:
 *   - Count must NEVER exceed the baseline in contrast-ratchet.baseline.json.
 *   - If count < baseline, update the baseline with `--update` and commit it.
 *   - Stories and test files are excluded.
 *
 * Usage:
 *   node scripts/lint-contrast-ratchet.mjs            # check only
 *   node scripts/lint-contrast-ratchet.mjs --update   # lower the baseline
 *
 * Exit 0 = all counts ≤ baseline.  Exit 1 = regression detected.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const BASELINE_PATH = join(projectRoot, 'contrast-ratchet.baseline.json');

const SCAN_DIRS = ['components', 'app'];
const EXTENSIONS = ['.tsx', '.ts'];
const SKIP_FRAGMENTS = ['.stories.', '.spec.', '.test.', '.storybook/'];

// ── helpers ────────────────────────────────────────────────────────────────

function shouldSkipLine(line) {
  return SKIP_FRAGMENTS.some(f => line.includes(f));
}

function walkDir(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      entry.name === 'node_modules' ||
      entry.name === '.next'
    ) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, files);
    } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Count lines that contain a bare `text-black` (no `dark:text-` on same line)
 * or a bare `bg-white` (no `dark:bg-` on same line), excluding tests/stories.
 */
function countViolations(files) {
  let bareTextBlack = 0;
  let bareBgWhite = 0;

  for (const filePath of files) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const line of content.split('\n')) {
      if (shouldSkipLine(line)) continue;

      // text-black as a standalone class token (not text-black/XX opacity variant)
      if (
        /(?:^|[\s"'`])text-black(?:[\s"'`]|$)/.test(line) &&
        !line.includes('dark:text-')
      ) {
        bareTextBlack += 1;
      }

      // bg-white as a standalone class token (not bg-white/XX opacity variant)
      if (
        /(?:^|[\s"'`])bg-white(?:[\s"'`]|$)/.test(line) &&
        !line.includes('dark:bg-')
      ) {
        bareBgWhite += 1;
      }
    }
  }

  return { bareTextBlack, bareBgWhite };
}

// ── main ───────────────────────────────────────────────────────────────────

const isUpdate = process.argv.includes('--update');

if (!existsSync(BASELINE_PATH)) {
  console.error(`[contrast-ratchet] ✗ Baseline not found: ${BASELINE_PATH}`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

const allFiles = [];
for (const dir of SCAN_DIRS) {
  walkDir(join(projectRoot, dir), allFiles);
}

const counts = countViolations(allFiles);

console.log(`[contrast-ratchet] Scanned ${allFiles.length} files`);
console.log(
  `[contrast-ratchet] bareTextBlack: ${counts.bareTextBlack} (baseline: ${baseline.bareTextBlack})`
);
console.log(
  `[contrast-ratchet] bareBgWhite:   ${counts.bareBgWhite} (baseline: ${baseline.bareBgWhite})`
);

if (isUpdate) {
  const updated = {
    ...baseline,
    bareTextBlack: counts.bareTextBlack,
    bareBgWhite: counts.bareBgWhite,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`[contrast-ratchet] ✓ Baseline updated → ${BASELINE_PATH}`);
  process.exit(0);
}

const errors = [];
if (counts.bareTextBlack > baseline.bareTextBlack) {
  errors.push(
    `bareTextBlack regression: ${counts.bareTextBlack} > baseline ${baseline.bareTextBlack}\n` +
      `  New \`text-black\` classes were added without a \`dark:text-*\` counterpart.\n` +
      `  Fix: use a semantic token (text-primary-token) or add \`dark:text-white\`.\n` +
      `  Once violations are fixed, lower the baseline: node scripts/lint-contrast-ratchet.mjs --update`
  );
}
if (counts.bareBgWhite > baseline.bareBgWhite) {
  errors.push(
    `bareBgWhite regression: ${counts.bareBgWhite} > baseline ${baseline.bareBgWhite}\n` +
      `  New \`bg-white\` classes were added without a \`dark:bg-*\` counterpart.\n` +
      `  Fix: use a semantic token (bg-surface-1) or add \`dark:bg-{dark-surface}\`.\n` +
      `  Once violations are fixed, lower the baseline: node scripts/lint-contrast-ratchet.mjs --update`
  );
}

if (errors.length > 0) {
  for (const e of errors) {
    console.error(`[contrast-ratchet] ✗ ${e}`);
  }
  process.exit(1);
}

const improved =
  counts.bareTextBlack < baseline.bareTextBlack ||
  counts.bareBgWhite < baseline.bareBgWhite;
if (improved) {
  console.log(
    '[contrast-ratchet] ✓ Violation count improved — run with --update to lower the baseline'
  );
} else {
  console.log('[contrast-ratchet] ✓ No regressions detected');
}
