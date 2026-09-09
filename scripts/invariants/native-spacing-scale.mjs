#!/usr/bin/env node
/**
 * Native second-spacing-scale detector (JOV-5865, parent JOV-3570).
 *
 * One 4px optical grid, company-wide. Swift (`.padding(N)`, `.padding(.edge, N)`,
 * `spacing: N`) and the Mac/Electron inline CSS strings (`gap: 10px`,
 * `padding: 0 13px`) must not carry a second scale. This script counts the
 * literals that fall off the grid and compares against a shrink-only baseline:
 * growth fails, remaining count never does.
 *
 * Tiers mirror apps/web/tests/unit/design-system/spacing-scale-ratchet.test.ts:
 *   - conservative (ARMED): literals >= 8 that are not a multiple of 4 —
 *     the values (10, 11, 13, 14, 18, …) that compete with the 8/12/16 seam.
 *   - strict (REPORTED): every literal that is not a multiple of 4, except the
 *     0 / 1 / 2 hairline steps.
 *
 * Locked atoms (ActionButton 32/510/r999, type 28/620) are sizes, not spacing
 * literals, and are never matched by these patterns.
 *
 * Usage:
 *   node scripts/invariants/native-spacing-scale.mjs          # human summary
 *   node scripts/invariants/native-spacing-scale.mjs --json   # machine output
 *   node scripts/invariants/native-spacing-scale.mjs --write-baseline
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..', '..');
export const BASELINE_RELATIVE =
  'scripts/invariants/native-spacing-scale.baseline.json';

export const NATIVE_SURFACES = Object.freeze({
  ios: Object.freeze({
    roots: Object.freeze(['apps/ios/Jovie']),
    extensions: Object.freeze(['.swift']),
  }),
  desktop: Object.freeze({
    roots: Object.freeze(['apps/desktop/src']),
    extensions: Object.freeze(['.ts']),
  }),
});

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.build',
  'DerivedData',
]);
const NON_PRODUCT_FILE = /(\.test\.|Tests\.swift$|\.stories\.)/;

// Swift: `.padding(14)`, `.padding(.vertical, 13)`, `spacing: 10`.
const SWIFT_LITERAL =
  /\.padding\(\s*(?:\.[a-zA-Z]+\s*,\s*)?(\d+(?:\.\d+)?)\s*\)|\bspacing:\s*(\d+(?:\.\d+)?)\b/g;
// CSS-in-string: `gap: 10px`, `padding: 0 13px`, `margin:4px 10px`.
const CSS_DECLARATION =
  /\b(?:padding|margin|gap|row-gap|column-gap|inset)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?\s*:\s*([^;{}"'`]+)/g;
const CSS_PX = /(\d+(?:\.\d+)?)px\b/g;

export function isOffGrid(value) {
  return value % 4 !== 0;
}

export function tierOf(value) {
  if (!isOffGrid(value)) return null;
  if (value >= 8) return 'conservative';
  if (value <= 2) return null;
  return 'strict';
}

function walk(dir, extensions, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, extensions, out);
    } else if (
      extensions.some(ext => entry.name.endsWith(ext)) &&
      !NON_PRODUCT_FILE.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

export function scanSwiftSource(source) {
  const values = [];
  for (const match of source.matchAll(SWIFT_LITERAL)) {
    values.push(Number(match[1] ?? match[2]));
  }
  return values;
}

export function scanCssSource(source) {
  const values = [];
  for (const declaration of source.matchAll(CSS_DECLARATION)) {
    for (const px of declaration[1].matchAll(CSS_PX)) {
      values.push(Number(px[1]));
    }
  }
  return values;
}

function tally(values) {
  let strict = 0;
  let conservative = 0;
  for (const value of values) {
    const tier = tierOf(value);
    if (tier === null) continue;
    strict += 1;
    if (tier === 'conservative') conservative += 1;
  }
  return { strict, conservative };
}

export function measureNativeSpacingScale(repoRoot = REPO_ROOT) {
  const surfaces = {};
  for (const [surface, config] of Object.entries(NATIVE_SURFACES)) {
    const files = [];
    for (const root of config.roots) {
      walk(join(repoRoot, root), config.extensions, files);
    }
    files.sort((a, b) => a.localeCompare(b));
    const scan = surface === 'ios' ? scanSwiftSource : scanCssSource;
    let strict = 0;
    let conservative = 0;
    const perFile = {};
    for (const file of files) {
      const counts = tally(scan(readFileSync(file, 'utf8')));
      // strict is a superset of conservative; files list the strict hits.
      if (counts.strict > 0) {
        perFile[relative(repoRoot, file).split('\\').join('/')] = counts;
      }
      strict += counts.strict;
      conservative += counts.conservative;
    }
    surfaces[surface] = {
      strict,
      conservative,
      files: Object.keys(perFile).length,
      perFile,
    };
  }
  return surfaces;
}

export function readBaseline(repoRoot = REPO_ROOT) {
  const path = join(repoRoot, BASELINE_RELATIVE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildBaseline(measured) {
  const surfaces = {};
  for (const [surface, result] of Object.entries(measured)) {
    surfaces[surface] = {
      conservative: result.conservative,
      strict: result.strict,
      files: result.files,
    };
  }
  return {
    $comment:
      'Shrink-only floors for off-4px-grid native spacing literals (JOV-5865). conservative (>=8 and not a multiple of 4) is armed: growth fails. strict is reported only until Tim thumbs it. Lower a number when a PR removes drift; never raise one.',
    armed: { conservative: true, strict: false },
    surfaces,
  };
}

/**
 * Growth-only verdict on the armed tier; strict is reported.
 */
export function evaluateNativeSpacingScale({ measured, baseline }) {
  const issues = [];
  const warnings = [];
  for (const [surface, result] of Object.entries(measured)) {
    const floor = baseline?.surfaces?.[surface];
    if (!floor) {
      issues.push(`${surface}: missing baseline entry in ${BASELINE_RELATIVE}`);
      continue;
    }
    if (result.conservative > floor.conservative) {
      issues.push(
        `${surface}: off-grid native spacing literals grew: ${result.conservative} > baseline ${floor.conservative}. ` +
          'Snap to the 4px grid (8 / 12 / 16) — do not add a second scale.'
      );
    }
    if (result.strict > floor.strict) {
      warnings.push(
        `${surface}: strict off-grid literals grew: ${result.strict} > baseline ${floor.strict} (not armed).`
      );
    }
  }
  return { ok: issues.length === 0, issues, warnings };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const measured = measureNativeSpacingScale();
  if (args.has('--write-baseline')) {
    writeFileSync(
      join(REPO_ROOT, BASELINE_RELATIVE),
      `${JSON.stringify(buildBaseline(measured), null, 2)}\n`
    );
  }
  const baseline = readBaseline();
  const verdict = evaluateNativeSpacingScale({ measured, baseline });
  if (args.has('--json')) {
    process.stdout.write(
      `${JSON.stringify({ measured, baseline, verdict }, null, 2)}\n`
    );
  } else {
    for (const [surface, result] of Object.entries(measured)) {
      const floor = baseline?.surfaces?.[surface];
      process.stdout.write(
        `[native-spacing-scale] ${surface}: conservative ${result.conservative}/${floor?.conservative ?? '?'} strict ${result.strict}/${floor?.strict ?? '?'} (${result.files} files)\n`
      );
    }
    for (const warning of verdict.warnings)
      process.stdout.write(`${warning}\n`);
    for (const issue of verdict.issues) process.stderr.write(`${issue}\n`);
    process.stdout.write(
      `[native-spacing-scale] ${verdict.ok ? 'PASS' : 'FAIL'}\n`
    );
  }
  if (!verdict.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
