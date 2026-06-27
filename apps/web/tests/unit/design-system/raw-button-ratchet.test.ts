import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Raw `<button>` drift ratchet.
 *
 * Counts raw `<button>` JSX tags across the web surfaces. The count may only
 * go DOWN: convergence onto the canonical `Button` (`@jovie/ui` /
 * `components/atoms/Button`) removes raw `<button>` usage, never adds it.
 *
 * Why a ratchet and not zero-tolerance: there are ~700 existing raw buttons;
 * banning them outright would block all work. The ratchet locks in progress —
 * regressions fail, conversions pass. When you reduce the count, lower `count`
 * in raw-button.baseline.json in the SAME PR so the floor follows the work down.
 *
 * Sibling of arbitrary-values-ratchet.test.ts — same committed-baseline shape.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['components', 'app'].map(d => join(WEB_ROOT, d));
const BASELINE_PATH = join(__dirname, 'raw-button.baseline.json');

// A raw lowercase `<button` opening tag: `<button` followed by whitespace,
// `>`, or `/` (self-closing). The lookahead avoids matching the canonical
// `<Button` component (capital B) and any hypothetical `<buttonish` element.
const RAW_BUTTON = /<button(?=[\s/>])/g;
const SOURCE_EXT = /\.(tsx|ts)$/;
// Test/spec/stories files are excluded: they mock UI for testing and should
// not count toward production UI drift. Only real components/pages are ratcheted.
const EXCLUDED_FILE = /\.(test|spec|stories)\./;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry) && !EXCLUDED_FILE.test(entry)) {
      out.push(full);
    }
  }
}

function countRawButtons(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(RAW_BUTTON);
    if (matches) total += matches.length;
  }
  return total;
}

describe('design-system raw-button ratchet', () => {
  it('raw <button> usage does not increase above the baseline', () => {
    const current = countRawButtons();

    // Self-seed on first run so the baseline and the count logic can never
    // diverge. Commit the seeded file; CI compares against it.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ count: current, note: 'Raw <button> tags in apps/web/{components,app}. Ratchet only goes down — lower this when a PR converts raw buttons to the canonical Button.' }, null, 2)}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    expect(
      current,
      `Raw <button> usage rose to ${current} (baseline ${baseline.count}). ` +
        'Use the canonical Button from @jovie/ui (or components/atoms/Button) instead of a raw <button>, ' +
        'or — if a raw <button> is genuinely required — justify it in review and raise the baseline with a Linear ID.'
    ).toBeLessThanOrEqual(baseline.count);
  });
});
