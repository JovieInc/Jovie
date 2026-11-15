#!/usr/bin/env node
/**
 * Focus canon guard.
 *
 * The product has one focus treatment, in apps/web/styles/focus.css: a
 * keyboard-only outline that follows the element's radius, drawn inside
 * clipping containers and owned by the container for composite fields.
 * Components must not paint their own focus with rings, outlines, borders or
 * shadows, because a second indicator is what puts square boxes inside pills
 * and clips rings at overflow edges.
 *
 * Counted per file, outside styles/focus.css:
 *   - focus, focus-visible, focus-within (and group-) variants of
 *     ring-*, outline-*, shadow-* and border-* classes, in TSX, TS and CSS
 *     @apply lines (peer-focus-visible rings are allowed: they are the cue
 *     for a visually hidden checkbox or radio);
 *   - the legacy focus-ring, focus-ring-themed, focus-ring-transparent-offset
 *     and input-focus-glow utilities;
 *   - CSS rules whose selector has :focus, :focus-visible or :focus-within
 *     and that set box-shadow, outline, border or a Tailwind ring.
 *
 * Ratchet: existing debt lives in focus-canon.baseline.json and each file's
 * count can only go down. Delete the ad hoc classes (focus.css already draws
 * the outline), then run `--update`. A new or grown file fails the gate.
 *
 * Usage:
 *   node scripts/lint-focus-canon.mjs          # check
 *   node scripts/lint-focus-canon.mjs --list   # print offenders
 *   node scripts/lint-focus-canon.mjs --update # rewrite the baseline
 *   node scripts/lint-focus-canon.mjs --tighten # lower it to the live counts
 *
 * The baseline holds per-file counts only (no total), so two green PRs that
 * shrink different files combine without a conflict.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..', '..');
export const BASELINE_PATH = join(webRoot, 'focus-canon.baseline.json');
export const CANON_PATH = 'apps/web/styles/focus.css';

const EDGE = '(?:^|[\\s\'"`{(,])';
const END = '(?=[\\s\'"`;})!,]|$)';
export const AD_HOC_FOCUS_CLASS = new RegExp(
  `${EDGE}((?:[^\\s'"\`]*:)?(?:group-(?:has-)?)?focus(?:-visible|-within)?:!?(?:ring|outline|shadow|border)(?:-[^\\s'"\`;]*)?)${END}`,
  'g'
);
export const LEGACY_FOCUS_UTILITY = new RegExp(
  `${EDGE}((?:[^\\s'"\`]*:)?(?:focus-ring(?:-themed|-transparent-offset)?|input-focus-glow))${END}`,
  'g'
);
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;
const CSS_FOCUS_SELECTOR = /:focus(?:-visible|-within)?\b/;
const CSS_FOCUS_PAINT =
  /(?:^|[\s;])(?:box-shadow|outline|border(?:-color)?|--tw-ring-[a-z-]+)\s*:/;

/** @returns {{ line: number, snippet: string }[]} */
export function findOffenders(source, { css = false } = {}) {
  const offenders = [];
  const lineOf = index => source.slice(0, index).split('\n').length;
  for (const pattern of [AD_HOC_FOCUS_CLASS, LEGACY_FOCUS_UTILITY]) {
    for (const match of source.matchAll(pattern)) {
      offenders.push({ line: lineOf(match.index), snippet: match[1] });
    }
  }
  if (css) {
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, c =>
      c.replace(/[^\n]/g, ' ')
    );
    for (const match of stripped.matchAll(CSS_RULE)) {
      const selector = match[1].trim();
      if (!CSS_FOCUS_SELECTOR.test(selector)) continue;
      if (!CSS_FOCUS_PAINT.test(match[2])) continue;
      offenders.push({
        line: lineOf(match.index + match[0].indexOf(selector)),
        snippet: selector.split('\n').pop().trim().slice(0, 80),
      });
    }
  }
  return offenders.sort((a, b) => a.line - b.line);
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', 'apps/web', 'packages/ui'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(f => /\.(tsx|ts|css)$/.test(f) && f !== CANON_PATH)
    .filter(
      f =>
        !/\.(test|stories|spec)\.tsx?$/.test(f) &&
        !/\.d\.ts$/.test(f) &&
        !/\/(fixtures|__tests__|node_modules|eslint-rules|scripts)\//.test(f)
    );
}

export function collect() {
  const result = {};
  for (const file of listFiles()) {
    let source;
    try {
      source = readFileSync(join(repoRoot, file), 'utf8');
    } catch {
      continue;
    }
    const found = findOffenders(source, { css: file.endsWith('.css') });
    if (found.length) result[file] = found;
  }
  return result;
}

/** Pure ratchet math: returns the list of problems (empty = pass). */
export function compareToBaseline(counts, baseline) {
  const problems = [];
  for (const [file, count] of Object.entries(counts)) {
    if (count > (baseline[file] ?? 0)) {
      problems.push(
        `${file}: ${count} ad hoc focus style(s) (baseline ${baseline[file] ?? 0}). Delete them: apps/web/styles/focus.css draws the one focus outline. Use data-focus-container or data-focus-inset if the default placement is wrong.`
      );
    }
  }
  return problems;
}

/** Shrink is a notice, never a failure. */
export function shrinkNotices(counts, baseline) {
  return Object.entries(baseline)
    .filter(([file, count]) => (counts[file] ?? 0) < count)
    .map(([file]) => `${file}: debt shrank; run --update to lock it in.`);
}

export function countsOf(current) {
  return Object.fromEntries(
    Object.entries(current).map(([f, o]) => [f, o.length])
  );
}

function main() {
  const args = new Set(process.argv.slice(2));
  const current = collect();
  const counts = countsOf(current);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (args.has('--list')) {
    for (const [file, found] of Object.entries(current)) {
      for (const o of found) console.log(`${file}:${o.line}  ${o.snippet}`);
    }
  }
  if (args.has('--update') || args.has('--tighten')) {
    const previous = args.has('--tighten')
      ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files
      : null;
    const next = previous
      ? Object.entries(previous)
          .map(([f, n]) => [f, Math.min(n, counts[f] ?? 0)])
          .filter(([, n]) => n > 0)
      : Object.entries(counts);
    const files = Object.fromEntries(next.sort(([a], [b]) => (a < b ? -1 : 1)));
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ files }, null, 2)}\n`);
    console.log(
      `focus-canon baseline written (${Object.values(files).reduce((a, n) => a + n, 0)} in ${Object.keys(files).length} files)`
    );
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files;
  for (const notice of shrinkNotices(counts, baseline)) {
    console.log(`::notice title=focus-canon::${notice}`);
  }
  const problems = compareToBaseline(counts, baseline);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `focus-canon guard ok (${total} ad hoc focus styles left in ${Object.keys(counts).length} files)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
