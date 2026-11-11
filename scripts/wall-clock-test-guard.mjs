#!/usr/bin/env node
/**
 * node scripts/wall-clock-test-guard.mjs [--check]   fail on a new wall-clock time bomb shape in a test
 * node scripts/wall-clock-test-guard.mjs --write     lower the ratchet to today's counts (never raises it)
 * node scripts/wall-clock-test-guard.mjs --bootstrap grandfather every current site (only while no ratchet exists)
 *
 * A test that reads the real clock and also holds a fixed calendar date passes
 * until the calendar reaches that date, then fails every merge group for
 * unrelated PRs: 44 groups on 2026-11-10 and a 7 hour stall on 2026-10-31
 * (docs/postmortems/2026-10-31-review-deadline-queue-stall.md), main red at
 * 00:00Z on 2026-10-13. scripts/time-bomb/scan.mjs finds these a week ahead on
 * a schedule and files an issue; this guard stops a new one at the PR.
 *
 * A test file is flagged when all three hold, comments ignored:
 *   1. it reads the real clock (Date.now(), new Date(), datetime.now(), ...),
 *   2. it holds a fixed calendar date ('2026-11-07', new Date(2026, ...),
 *      datetime(2026, ...)),
 *   3. it never takes control of the clock (fake timers, a Date spy,
 *      freezegun, a patched datetime/time).
 * A real clock with only relative dates, or fixed dates with no clock read,
 * is not flagged. Grandfathered files live in
 * scripts/lib/wall-clock-test-guard.ratchet.json (real-clock reads per file)
 * and only shrink.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RATCHET_PATH = 'scripts/lib/wall-clock-test-guard.ratchet.json';
export const RATCHET_SCHEMA = 'jovie.wall-clock-test-guard-ratchet/v1';

const JS_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const PY_TEST = /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/u;
// Vendored skill trees carry their own upstream tests; none run in a lane.
const SKIPPED = /(?:^|\/)(?:node_modules|\.agents|\.claude\/skills)\//u;

const JS_REAL_CLOCK =
  /\bDate\.now\(\s*\)|\bnew Date\(\s*\)|\bnew Date\b(?!\s*\()(?=\s*[;,)\n.])|\bTemporal\.Now\.|\b(?:dayjs|moment)\(\s*\)/gu;
const PY_REAL_CLOCK =
  /\bdatetime\.(?:now|utcnow|today)\(|\bdate\.today\(|\btime\.time\(\s*\)/gu;
// A string literal that starts with an ISO date, an ISO timestamp anywhere in
// a string, or a date built from a literal year.
const JS_FIXED_DATE =
  /['"`]20\d\d-[01]\d-[0-3]\d(?!\d)|\b20\d\d-[01]\d-[0-3]\dT[0-2]\d:|\bnew Date\(\s*20\d\d\s*,|\bDate\.UTC\(\s*20\d\d\b/u;
const PY_FIXED_DATE =
  /['"]20\d\d-[01]\d-[0-3]\d(?!\d)|\b20\d\d-[01]\d-[0-3]\dT[0-2]\d:|\b(?:datetime|date)\(\s*20\d\d\s*,/u;
const JS_CLOCK_CONTROL =
  /\buseFakeTimers\b|\bsetSystemTime\b|\bmock\.timers\b|\bMockDate\b|\bmockdate\b|fake-timers|\bspyOn\(\s*(?:globalThis\.|global\.)?Date\b|\bstubGlobal\(\s*['"]Date['"]|\bDate\.now\s*=[^=]|\bclock\.(?:install|setFixedTime|setSystemTime)\b/u;
const PY_CLOCK_CONTROL =
  /\bfreeze_time\b|\bfreezegun\b|\btime_machine\b|\bpatch(?:\.object)?\([^)\n]*(?:datetime|time\b)|\bmonkeypatch\.setattr\([^)\n]*(?:datetime|time\b)/u;

export function language(path) {
  if (SKIPPED.test(path)) return null;
  if (JS_TEST.test(path)) return 'js';
  if (PY_TEST.test(path)) return 'py';
  return null;
}

/**
 * Remove comments and keep everything else, strings included. String-aware:
 * a glob such as 'apps/web/**' or a URL such as 'http://localhost/*' inside a
 * string never opens a comment, so code after it is still scanned. Template
 * literals nest: `${...}` is code again (tracked on a stack with its brace
 * depth), and a template inside it is a template again.
 */
export function stripComments(text, lang) {
  const py = lang === 'py';
  const n = text.length;
  let out = '';
  let i = 0;
  // One frame per open `${`: the `{` depth inside that interpolation.
  const interpolations = [];

  /** Copy template text from i up to its closing backtick or the next `${`. */
  const template = () => {
    while (i < n) {
      if (text[i] === '\\') {
        out += text.slice(i, i + 2);
        i += 2;
      } else if (text[i] === '`') {
        out += '`';
        i += 1;
        return;
      } else if (text.startsWith('${', i)) {
        out += '${';
        i += 2;
        interpolations.push(0);
        return;
      } else {
        out += text[i];
        i += 1;
      }
    }
  };

  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (py ? c === '#' : two === '//') {
      while (i < n && text[i] !== '\n') i += 1;
    } else if (!py && two === '/*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
    } else if (!py && c === '`') {
      out += '`';
      i += 1;
      template();
    } else if (!py && interpolations.length && c === '{') {
      interpolations[interpolations.length - 1] += 1;
      out += c;
      i += 1;
    } else if (!py && interpolations.length && c === '}') {
      out += c;
      i += 1;
      if (interpolations[interpolations.length - 1] === 0) {
        interpolations.pop();
        template();
      } else interpolations[interpolations.length - 1] -= 1;
    } else if (c === '"' || c === "'") {
      const triple = py && text.slice(i, i + 3) === c.repeat(3);
      const close = triple ? c.repeat(3) : c;
      let j = i + close.length;
      while (j < n) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text.startsWith(close, j)) {
          j += close.length;
          break;
        }
        // An unterminated one-line string ends at the newline.
        if (!triple && text[j] === '\n') break;
        j += 1;
      }
      out += text.slice(i, j);
      i = j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Real-clock reads in a test that also pins a calendar date; 0 when safe. */
export function countIn(text, lang = 'js') {
  const [real, fixed, control] =
    lang === 'py'
      ? [PY_REAL_CLOCK, PY_FIXED_DATE, PY_CLOCK_CONTROL]
      : [JS_REAL_CLOCK, JS_FIXED_DATE, JS_CLOCK_CONTROL];
  // Most tests never read the clock: skip the comment pass for them.
  if ((text.match(real) ?? []).length === 0) return 0;
  const code = stripComments(text, lang);
  const reads = (code.match(real) ?? []).length;
  if (reads === 0 || !fixed.test(code) || control.test(code)) return 0;
  return reads;
}

export function scan(root, files) {
  const counts = {};
  for (const file of files) {
    const lang = language(file);
    if (!lang) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const n = countIn(text, lang);
    if (n) counts[file] = n;
  }
  return counts;
}

export function violations(counts, ratchet) {
  return Object.entries(counts)
    .filter(([file, n]) => n > (ratchet[file] ?? 0))
    .map(([file, n]) => ({ file, found: n, allowed: ratchet[file] ?? 0 }));
}

export function tighten(counts, ratchet) {
  const next = {};
  for (const [file, allowed] of Object.entries(ratchet)) {
    const n = counts[file] ?? 0;
    if (n > 0) next[file] = Math.min(allowed, n);
  }
  return Object.fromEntries(Object.entries(next).sort());
}

function root() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

function trackedFiles(cwd) {
  // Tracked plus new untracked files, so a local run sees a test not yet added.
  const out = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }
  );
  return [...new Set(out.stdout.split('\0').filter(Boolean))];
}

export const FIX_MESSAGE =
  'Fix: take control of the clock in the test (vi.useFakeTimers() + vi.setSystemTime(), ' +
  "node:test mock.timers.enable({ apis: ['Date'] }), freezegun in pytest), or pass a fixed " +
  '`now` into the code under test, or build the dates from the test clock ' +
  '(new Date(Date.now() + 86_400_000)) instead of typing a calendar date. A test that ' +
  'compares the real clock with a typed date passes today and fails every merge group ' +
  'the day the calendar reaches it. A deliberate review deadline reads its clock from ' +
  'calendarDeadlineClock (apps/web/tests/utils/calendar-deadline-clock.ts), so the daily ' +
  'time-bomb scan files it for its owner a week ahead.';

export function main(argv = process.argv.slice(2)) {
  const cwd = root();
  const path = join(cwd, RATCHET_PATH);
  const counts = scan(cwd, trackedFiles(cwd));
  const save = entries =>
    writeFileSync(
      path,
      `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
    );
  if (argv.includes('--bootstrap')) {
    if (existsSync(path)) {
      console.error(
        'wall-clock-test-guard: ratchet exists; use --write to tighten it'
      );
      return 1;
    }
    save(Object.fromEntries(Object.entries(counts).sort()));
    return 0;
  }
  const ratchet = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).entries
    : {};
  if (argv.includes('--write')) {
    save(tighten(counts, ratchet));
    return 0;
  }
  const bad = violations(counts, ratchet);
  if (bad.length) {
    console.error(
      'wall-clock-test-guard: test reads the real clock and pins a calendar date without controlling the clock:'
    );
    for (const v of bad)
      console.error(
        `  ${v.file}: ${v.found} real-clock read(s), ${v.allowed} allowed`
      );
    console.error(FIX_MESSAGE);
    return 1;
  }
  const slack = Object.entries(ratchet).filter(
    ([f, n]) => (counts[f] ?? 0) < n
  ).length;
  if (slack)
    console.log(
      `wall-clock-test-guard: ok; ${slack} grandfathered file(s) can shrink (run --write)`
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main());
