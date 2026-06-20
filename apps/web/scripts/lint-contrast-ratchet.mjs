#!/usr/bin/env node
/**
 * Contrast ratchet guard — static source-file lint (JOV-11038, JOV-11025).
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
 *   bareHexText   — `text-[#hex]` without a `dark:text-*` counterpart (JOV-11025).
 *                   Hardcoded hex text fails contrast when the theme flips.
 *                   Opacity-modified hex (text-[#xxx]/40) is excluded.
 *
 *   bareHexBg     — `bg-[#hex]` without a `dark:bg-*` counterpart (JOV-11025).
 *                   Hardcoded hex backgrounds fail contrast in the opposite theme.
 *                   Opacity-modified hex (bg-[#xxx]/96) is excluded.
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

// Hex arbitrary-value patterns. The `(?!\/)` negative lookahead excludes
// opacity-modified variants like bg-[#06070a]/96 (intentional overlay).
const HEX_TEXT_LINE_RE = /text-\[#[0-9a-fA-F]{3,8}\](?!\/)/;
const HEX_BG_LINE_RE = /bg-\[#[0-9a-fA-F]{3,8}\](?!\/)/;

/**
 * Count lines that contain a bare `text-black` (no `dark:text-` on same line),
 * a bare `bg-white` (no `dark:bg-` on same line), a hardcoded hex text color
 * (no `dark:text-` on same line), or a hardcoded hex bg color (no `dark:bg-`).
 * Excludes tests/stories.
 */
function countViolations(files) {
  let bareTextBlack = 0;
  let bareBgWhite = 0;
  let bareHexText = 0;
  let bareHexBg = 0;

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

      // Hardcoded hex text color without dark counterpart (JOV-11025)
      if (HEX_TEXT_LINE_RE.test(line) && !line.includes('dark:text-')) {
        bareHexText += 1;
      }

      // Hardcoded hex background without dark counterpart (JOV-11025)
      if (HEX_BG_LINE_RE.test(line) && !line.includes('dark:bg-')) {
        bareHexBg += 1;
      }
    }
  }

  return { bareTextBlack, bareBgWhite, bareHexText, bareHexBg };
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

const FIELDS = [
  {
    key: 'bareTextBlack',
    label: 'bareTextBlack',
    fix: 'use a semantic token (text-primary-token) or add `dark:text-white`',
    example: '`text-black`',
  },
  {
    key: 'bareBgWhite',
    label: 'bareBgWhite  ',
    fix: 'use a semantic token (bg-surface-1) or add `dark:bg-{dark-surface}`',
    example: '`bg-white`',
  },
  {
    key: 'bareHexText',
    label: 'bareHexText  ',
    fix: 'use a semantic System B token (text-primary-token) or add `dark:text-<token>`',
    example: '`text-[#hex]`',
  },
  {
    key: 'bareHexBg',
    label: 'bareHexBg    ',
    fix: 'use a semantic System B token (bg-surface-1) or add `dark:bg-<token>`',
    example: '`bg-[#hex]`',
  },
];

console.log(`[contrast-ratchet] Scanned ${allFiles.length} files`);
for (const { key, label } of FIELDS) {
  const base = baseline[key] ?? 0;
  console.log(
    `[contrast-ratchet] ${label}: ${counts[key]} (baseline: ${base})`
  );
}

if (isUpdate) {
  const updated = { ...baseline };
  for (const { key } of FIELDS) updated[key] = counts[key];
  writeFileSync(BASELINE_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`[contrast-ratchet] ✓ Baseline updated → ${BASELINE_PATH}`);
  process.exit(0);
}

const errors = [];
for (const { key, fix, example } of FIELDS) {
  const base = baseline[key] ?? 0;
  if (counts[key] > base) {
    errors.push(
      `${key} regression: ${counts[key]} > baseline ${base}\n` +
        `  New ${example} classes were added without a \`dark:\` counterpart.\n` +
        `  Fix: ${fix}.\n` +
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

const improved = FIELDS.some(({ key }) => counts[key] < (baseline[key] ?? 0));
if (improved) {
  console.log(
    '[contrast-ratchet] ✓ Violation count improved — run with --update to lower the baseline'
  );
} else {
  console.log('[contrast-ratchet] ✓ No regressions detected');
}
