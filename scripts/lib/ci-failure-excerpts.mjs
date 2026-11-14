/**
 * Failure excerpts for ci-fast lanes: pulls failing test identities and
 * diagnostic lines out of raw lane output, bounds them for the job summary and
 * the lane result JSON, and escapes them for `::error::` annotations.
 *
 * Pure text handling with no process or filesystem access; ci-fast-lanes.mjs
 * re-exports the public names.
 */

import { escapeAnnotationMessage } from './ci-fast-annotations.mjs';

const GIT_FETCH_NOISE_LINE =
  /^\s*(?:\* \[new (?:branch|tag)\]|[0-9a-f]+\.\.[0-9a-f]+\s)/u;
// Lowercase `error` catches TypeScript's `file.ts(1,2): error TS2532: …` while
// the word boundary still skips summary noise such as `errors: 0`.
const DIAGNOSTIC_LINE =
  /\b(?:ERROR|\w*Error|error|FAIL|FAILED|failed|expected)\b/u;
// Passing TAP tests whose names merely contain `failed`/`error` are not causes.
const TAP_PASS_LINE = /^(?:ok \d+ - |# Subtest: )/u;
const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,
  'gu'
);

/** Drop `git fetch` ref-update noise so excerpts keep the real failure. */
export function stripGitFetchNoise(text) {
  return (text || '')
    .split('\n')
    .filter(line => !GIT_FETCH_NOISE_LINE.test(line))
    .join('\n');
}

function boundedLine(raw, width = 200) {
  const line = String(raw ?? '')
    .replace(ANSI_ESCAPE, '')
    .trim();
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
}

/** Last few bounded, de-duplicated lines that look like a failure cause. */
export function extractDiagnosticLines(text, { max = 5, width = 200 } = {}) {
  const lines = [];
  for (const raw of stripGitFetchNoise(text).split('\n')) {
    const line = boundedLine(raw, width);
    if (!line || !DIAGNOSTIC_LINE.test(line) || TAP_PASS_LINE.test(line)) {
      continue;
    }
    lines.push(line);
  }
  // Keep the LAST occurrence of a repeated line so a root cause that repeats
  // at the end of the log is not dropped by the tail slice.
  const newestFirst = [...new Set(lines.reverse())];
  return newestFirst.slice(0, max).reverse();
}

const NODE_SUBTEST_LINE = /^(\s*)# Subtest: (.+)$/u;
const NODE_NOT_OK_LINE = /^(\s*)not ok \d+ - (.+?)(?: # (?:SKIP|TODO)\b.*)?$/u;
const NODE_DETAIL_LINE = /^(\s*)(failureType|error|expected|actual): ?(.*)$/u;
const YAML_BLOCK_SCALAR = /^[|>][+-]?$/u;
const VITEST_FAIL_LINE =
  /^FAIL\s+(?:\|[^|]+\|\s+)?\S+\.(?:test|spec)\.[cm]?[jt]sx?\b/u;
const VITEST_ERROR_LINE = /^(?:[A-Z]\w*)?Error\b[^:]*:/u;
const PYTEST_NODE = String.raw`(scripts\/[\w./-]+\.py)::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)`;
const PYTEST_SUMMARY_LINE = new RegExp(
  String.raw`^(FAILED|ERROR) ${PYTEST_NODE}(?=\[| - |$)`,
  'u'
);
// `pytest -v` progress lines still name the test when the run is killed
// before its short test summary prints.
const PYTEST_PROGRESS_LINE = new RegExp(
  String.raw`^${PYTEST_NODE}(?:\[[^\]\n]*\])? (FAILED|ERROR)\b`,
  'u'
);
const PYTEST_IDENTITY_LINE = /^(?:FAILED|ERROR) scripts\/[\w./-]+\.py::/u;
/** Header lines that name a failing test; the annotation keeps them in order. */
const TEST_IDENTITY_LINE = new RegExp(
  `${PYTEST_IDENTITY_LINE.source}|^not ok - |${VITEST_FAIL_LINE.source}`,
  'u'
);

/** node:test TAP YAML fields for the `not ok` block starting at `start`. */
function nodeFailureDetails(lines, start, indent) {
  const details = {};
  const fieldIndent = indent + 2;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].replace(ANSI_ESCAPE, '');
    const leading = line.length - line.trimStart().length;
    if (line.trim() && leading < fieldIndent) break;
    if (line.trim() === '...' && leading === fieldIndent) break;
    const field = NODE_DETAIL_LINE.exec(line);
    if (!field || field[1].length !== fieldIndent || field[2] in details) {
      continue;
    }
    let value = field[3].trim();
    if (YAML_BLOCK_SCALAR.test(value)) {
      value =
        lines
          .slice(index + 1)
          .map(next => next.replace(ANSI_ESCAPE, '').trim())
          .find(Boolean) ?? '';
    }
    details[field[2]] = value;
  }
  return details;
}

/** `not ok` leaves with their `# Subtest:` ancestry and assertion fields. */
function nodeTestFailures(lines, max, width) {
  const failures = [];
  /** @type {{ indent: number, name: string }[]} */
  const ancestry = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (failures.length === max) break;
    const line = lines[index].replace(ANSI_ESCAPE, '');
    const subtest = NODE_SUBTEST_LINE.exec(line);
    if (subtest) {
      const indent = subtest[1].length;
      while (ancestry.length > 0 && ancestry.at(-1).indent >= indent) {
        ancestry.pop();
      }
      ancestry.push({ indent, name: subtest[2].trim() });
      continue;
    }
    const notOk = NODE_NOT_OK_LINE.exec(line);
    if (!notOk) continue;
    const indent = notOk[1].length;
    const details = nodeFailureDetails(lines, index + 1, indent);
    // A suite fails when a child fails; the child already names the cause.
    if (details.failureType === "'subtestsFailed'") continue;
    const path = [
      ...ancestry.filter(entry => entry.indent < indent).map(e => e.name),
      notOk[2].trim(),
    ];
    failures.push([
      boundedLine(`not ok - ${path.join(' > ')}`, width),
      ...['error', 'expected', 'actual'].flatMap(key =>
        details[key] ? [boundedLine(`${key}: ${details[key]}`, width)] : []
      ),
    ]);
  }
  return failures;
}

/** Vitest `FAIL file > suite > test` lines with their first error line. */
function vitestFailures(lines, max, width) {
  const failures = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (failures.length === max) break;
    const line = boundedLine(lines[index], width);
    if (!VITEST_FAIL_LINE.test(line) || seen.has(line)) continue;
    seen.add(line);
    const failure = [line];
    for (const next of lines.slice(index + 1, index + 9)) {
      const candidate = boundedLine(next, width);
      if (VITEST_FAIL_LINE.test(candidate)) break;
      if (VITEST_ERROR_LINE.test(candidate)) {
        failure.push(candidate);
        break;
      }
    }
    failures.push(failure);
  }
  return failures;
}

/**
 * Failing node:test / Vitest test identities plus their assertion message,
 * in output order. A bounded tail excerpt otherwise drops the test name
 * behind coverage tables and passing-test noise.
 */
export function extractFailureIdentities(text, { max = 3, width = 200 } = {}) {
  const lines = stripGitFetchNoise(text).split('\n');
  const failures = nodeTestFailures(lines, max, width);
  failures.push(...vitestFailures(lines, max - failures.length, width));
  return failures.flat();
}

/** Keep leading lines (the first always) while their total stays in `max`. */
function capLines(lines, max) {
  const kept = [];
  let used = 0;
  for (const line of lines) {
    if (kept.length > 0 && used + line.length + 1 > max) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept;
}

export function commandLabel(command, max = 80) {
  const flat = String(command ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function excerpt(text, max = 1200) {
  if (max <= 0) return '';
  const trimmed = stripGitFetchNoise(text).trim();
  if (trimmed.length <= max) return trimmed;
  return `…${trimmed.slice(-max)}`;
}

/** Header body budget so the excerpt tail keeps some raw context. */
const HEADER_BODY_MAX = 800;

/**
 * Failure excerpt for a lane: failing test identities, then diagnostic lines,
 * then the output tail. Structural builds its own header in runStructural.
 */
export function laneFailureExcerpt(laneId, output) {
  const text = output || '';
  if (laneId === 'structural' && text.startsWith('Structural command ')) {
    return excerpt(text);
  }
  const identities = extractFailureIdentities(text);
  const named = new Set(identities);
  const diagnostics = extractDiagnosticLines(text).filter(
    line => !named.has(line)
  );
  if (identities.length + diagnostics.length === 0) return excerpt(text);
  const header = [
    'Diagnostics:',
    ...capLines([...identities, ...diagnostics], HEADER_BODY_MAX),
  ].join('\n');
  return `${header}\n\n${excerpt(text, 1200 - header.length - 3)}`;
}

/**
 * Join a header's lead line with as many body lines as fit in `max` chars.
 * Diagnostic lines are chosen from the END so earlier errors cannot crowd out
 * the final root-cause line; a header that leads with a test identity keeps
 * its order so the first failing test stays the lead identity.
 */
function budgetHeader(header, max = 400) {
  const [lead, ...rest] = header.split('\n');
  const separator = ' | ';
  const fromEnd = !TEST_IDENTITY_LINE.test(rest[0] ?? '');
  const ordered = fromEnd ? [...rest].reverse() : rest;
  const kept = [];
  let used = lead.length;
  for (const line of ordered) {
    const cost = separator.length + line.length;
    if (used + cost > max) break;
    kept.push(line);
    used += cost;
  }
  if (kept.length === 0 && ordered.length > 0) kept.push(ordered[0]);
  if (fromEnd) kept.reverse();
  return [lead, ...kept].join(separator).slice(0, max);
}

/** One-line, escaped `::error::` body (≤400 chars before escaping). */
export function failureAnnotationMessage(lane, logExcerpt) {
  if (!logExcerpt) return '';
  const useHeader =
    (lane.id === 'structural' &&
      logExcerpt.startsWith('Structural command ')) ||
    logExcerpt.startsWith('Diagnostics:\n');
  const short = useHeader
    ? budgetHeader(logExcerpt.split('\n\n')[0])
    : logExcerpt.split('\n').slice(-8).join(' | ').slice(0, 400);
  return escapeAnnotationMessage(short);
}

/** Registered pytest `FAILED`/`ERROR` identities, first three in output order. */
function registeredPytestIdentities(command, output) {
  const pytestArgs = /\bpython3 -m pytest\s+([^;&]+)/u.exec(command)?.[1] || '';
  const targets = new Set(
    pytestArgs
      .split(/\s+/u)
      .filter(path => /^scripts\/[\w./-]+\.py$/u.test(path))
  );
  const identities = new Set();
  for (const line of output.split('\n')) {
    const summary = PYTEST_SUMMARY_LINE.exec(line);
    const progress = summary ? null : PYTEST_PROGRESS_LINE.exec(line);
    const match = summary
      ? { outcome: summary[1], file: summary[2], node: summary[3] }
      : progress && {
          outcome: progress[3],
          file: progress[1],
          node: progress[2],
        };
    if (!match || !targets.has(match.file)) continue;
    const identity = `${match.outcome} ${match.file}::${match.node}`;
    if (identity.length > 200) continue;
    identities.add(identity);
    if (identities.size === 3) break;
  }
  return [...identities];
}

/**
 * Keep only registered pytest identities (assertion bodies are not diagnostic
 * labels); otherwise node:test / Vitest identities, then generic diagnostics.
 */
export function structuralFailureExcerpt(command, output, index, count, code) {
  const pytest = registeredPytestIdentities(command, output);
  const tests = pytest.length > 0 ? pytest : extractFailureIdentities(output);
  // Test identities win; otherwise surface the likeliest cause (e.g. a
  // coverage-threshold ERROR) instead of only the exit code.
  const body = tests.length > 0 ? tests : extractDiagnosticLines(output);
  const header = [
    `Structural command ${index + 1}/${count} failed (exit ${code}). Command: ${commandLabel(command)}`,
    ...capLines(body, HEADER_BODY_MAX),
  ].join('\n');
  return `${header}\n\n${excerpt(output, 1200 - header.length - 3)}`;
}
