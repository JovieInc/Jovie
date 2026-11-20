#!/usr/bin/env node
/**
 * Composite-field focus guard.
 *
 * A text input that removes its own focus treatment (`outline-none`,
 * `focus-visible:ring-0`, `[outline:none]`, ...) is only legal when it sits
 * inside the DS `CompositeField` primitive (packages/ui/atoms/composite-field),
 * which draws a pill/radius-following `:focus-within` ring on the container.
 * Anywhere else the input ends up with no visible focus, or with the browser's
 * square default ring inside a rounded pill (the homepage claim field bug,
 * 2026-10-28).
 *
 * Ratchet: existing offenders live in composite-field.baseline.json and the
 * count can only go down. Migrate an offender to CompositeField, then run
 * `--update`. A new offender fails the gate.
 *
 * Usage:
 *   node scripts/lint-composite-field.mjs          # check
 *   node scripts/lint-composite-field.mjs --list   # print offenders
 *   node scripts/lint-composite-field.mjs --update # rewrite the baseline
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..', '..');
export const BASELINE_PATH = join(webRoot, 'composite-field.baseline.json');

const INPUT_TAG = /<(?:input|textarea|Input|Textarea)\b/g;
export const DROPS_OWN_FOCUS =
  /(?:^|[\s'"`:])(?:focus(?:-visible)?:)?(?:outline-none|outline-0|ring-0|shadow-none)(?=[\s'"`!]|$)|\[outline:\s*none\]|focus(?:-visible)?:!?ring-0/;

/** @returns {{ line: number, snippet: string }[]} */
export function findOffenders(source) {
  if (/\bCompositeField\b/.test(source)) return [];
  const offenders = [];
  for (const match of source.matchAll(INPUT_TAG)) {
    const rest = source.slice(match.index, match.index + 1600);
    const end = rest.search(/\/>|<\/(?:input|textarea|Input|Textarea)>/);
    const tag = end === -1 ? rest : rest.slice(0, end);
    if (!/focus|outline/.test(tag)) continue;
    if (!DROPS_OWN_FOCUS.test(tag.replace(/\bfocus-visible:ring-2\b/g, ''))) {
      continue;
    }
    // A pure `outline-none` paired with its own visible ring is fine.
    const paintsOwnRing =
      /focus(?:-visible)?:(?:ring-[1-9]|shadow-(?!none)|border-)/.test(tag);
    if (paintsOwnRing && !/focus(?:-visible)?:ring-0/.test(tag)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    offenders.push({ line, snippet: tag.split('\n')[0].trim().slice(0, 80) });
  }
  return offenders;
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', 'apps/web', 'packages/ui'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(f => f.endsWith('.tsx'))
    .filter(
      f =>
        !/\.(test|stories|spec)\.tsx$/.test(f) &&
        !/\/(exp|fixtures|__tests__|node_modules)\//.test(f)
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
    const found = findOffenders(source);
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
        `${file}: ${count} input(s) drop their own focus treatment outside CompositeField (baseline ${baseline[file] ?? 0}). Wrap the field in <CompositeField> from @jovie/ui/atoms/composite-field.`
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
  if (args.has('--list')) {
    for (const [file, found] of Object.entries(current)) {
      for (const o of found) console.log(`${file}:${o.line}  ${o.snippet}`);
    }
  }
  if (args.has('--update')) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ files: counts }, null, 2)}\n`
    );
    console.log(
      `composite-field baseline updated (${Object.keys(counts).length} files)`
    );
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files;
  for (const notice of shrinkNotices(counts, baseline)) {
    console.log(`::notice title=composite-field::${notice}`);
  }
  const problems = compareToBaseline(counts, baseline);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `composite-field guard ok (${Object.keys(baseline).length} baselined files)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
