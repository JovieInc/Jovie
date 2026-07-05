#!/usr/bin/env node
/**
 * Contrast ratchet guard — static source-file lint (JOV-11026/11038).
 *
 * Counts raw-color Tailwind class utilities that bypass the System B token
 * layer and cause invisible-text contrast failures across themes:
 *
 *   bareTextBlack — `text-black` without `dark:text-*` on same line
 *   bareBgWhite   — `bg-white`   without `dark:bg-*`   on same line
 *   bareTextWhite — `text-white` without `dark:text-*` on same line
 *   bareBgBlack   — `bg-black`   without `dark:bg-*`   on same line
 *   arbitraryHex  — `text-[#hex]`, `bg-[#hex]`, `border-[#hex]` (always banned)
 *
 * Opacity-modified variants (e.g. `text-black/20`, `bg-white/5`) are
 * intentional overlay patterns and are excluded from counting.
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
 * Returns true if the line contains `token/` (opacity-modified variant).
 * e.g. text-black/20 → intentional overlay, not an absolute color.
 */
function lineHasOpacityVariant(line, token) {
  return line.includes(`${token}/`);
}

/**
 * Count all raw-color violation categories across the scanned source files.
 */
function countViolations(files) {
  let bareTextBlack = 0;
  let bareBgWhite = 0;
  let bareTextWhite = 0;
  let bareBgBlack = 0;
  let arbitraryHex = 0;

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
        !lineHasOpacityVariant(line, 'text-black') &&
        /(?:^|[\s"'`])text-black(?:[\s"'`]|$)/.test(line) &&
        !line.includes('dark:text-')
      ) {
        bareTextBlack += 1;
      }

      // bg-white as a standalone class token (not bg-white/XX opacity variant)
      if (
        !lineHasOpacityVariant(line, 'bg-white') &&
        /(?:^|[\s"'`])bg-white(?:[\s"'`]|$)/.test(line) &&
        !line.includes('dark:bg-')
      ) {
        bareBgWhite += 1;
      }

      // text-white as a standalone class token (not text-white/XX opacity variant)
      if (
        !lineHasOpacityVariant(line, 'text-white') &&
        /(?:^|[\s"'`])text-white(?:[\s"'`]|$)/.test(line) &&
        !line.includes('dark:text-')
      ) {
        bareTextWhite += 1;
      }

      // bg-black as a standalone class token (not bg-black/XX opacity variant)
      if (
        !lineHasOpacityVariant(line, 'bg-black') &&
        /(?:^|[\s"'`])bg-black(?:[\s"'`]|$)/.test(line) &&
        !line.includes('dark:bg-')
      ) {
        bareBgBlack += 1;
      }

      // Arbitrary hex: text-[#hex], bg-[#hex], border-[#hex] — always banned
      if (/(?:text|bg|border)-\[#[0-9a-fA-F]/.test(line)) {
        arbitraryHex += 1;
      }
    }
  }

  return {
    bareTextBlack,
    bareBgWhite,
    bareTextWhite,
    bareBgBlack,
    arbitraryHex,
  };
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
for (const key of Object.keys(counts)) {
  const base = baseline[key] ?? 0;
  console.log(`[contrast-ratchet] ${key}: ${counts[key]} (baseline: ${base})`);
}

if (isUpdate) {
  const updated = {
    ...baseline,
    ...Object.fromEntries(Object.entries(counts)),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`[contrast-ratchet] ✓ Baseline updated → ${BASELINE_PATH}`);
  process.exit(0);
}

const errors = [];

for (const [key, count] of Object.entries(counts)) {
  const base = baseline[key] ?? 0;
  if (count > base) {
    errors.push(
      `${key} regression: ${count} > baseline ${base}\n` +
        `  New raw-color violations introduced. Use a semantic token instead\n` +
        `  (text-foreground, bg-background, bg-surface-1, border-border, etc.).\n` +
        `  See DESIGN.md → "Use tokens, not raw colors".\n` +
        `  Once violations are fixed, lower the baseline: node scripts/lint-contrast-ratchet.mjs --update`
    );
  }
}

if (errors.length > 0) {
  for (const e of errors) {
    console.error(`[contrast-ratchet] ✗ ${e}`);
  }
  process.exit(1);
}

const improved = Object.entries(counts).some(
  ([key, count]) => count < (baseline[key] ?? 0)
);
if (improved) {
  console.log(
    '[contrast-ratchet] ✓ Violation count improved — run with --update to lower the baseline'
  );
} else {
  console.log('[contrast-ratchet] ✓ No regressions detected');
}
