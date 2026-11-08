// Finds wall-clock assertions in merge-gating tests (JOV-10086).
//
// A test that asserts how long something took, or races a real timer against
// an assertion, fails on a loaded runner and takes the whole merge group with
// it. Assert on order, state or an injected clock instead. A genuine perf
// budget belongs in a `*.perf.test.*` file, which gating suites exclude and
// the non-blocking perf lane runs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

export const PERF_FILE = /\.perf\.test\.|(^|\/)test_[^/]*_perf\.py$/;
export const TEST_FILE =
  /(\.test\.(mjs|cjs|js|ts|tsx)|(^|\/)test_[^/]+\.py|\.test\.py)$/;
const EXCLUDED_DIR = /(^|\/)(node_modules|e2e|playwright)\//;
const OPT_OUT = /wall-clock-ok:\s*\S/;

// A clock read or a duration-named value feeding a comparison.
const CLOCK = String.raw`(?:Date\.now\(\)|performance\.now\(\)|time\.time\(\)|time\.monotonic\(\)|time\.perf_counter\(\)|\b(?:elapsed|elapsedMs|duration|durationMs|took|tookMs)\b)`;
const PY_PATTERNS = [
  new RegExp(String.raw`^\s*assert\b[^\n]*${CLOCK}[^\n]*[<>]=?`),
  new RegExp(String.raw`assert(?:Less|Greater)(?:Equal)?\([^)]*${CLOCK}`),
];

const DURATION_NAME = /^(?:elapsed|elapsedMs|duration|durationMs|took|tookMs)$/;
const MATCHERS = new Set([
  'toBeLessThan',
  'toBeLessThanOrEqual',
  'toBeGreaterThan',
  'toBeGreaterThanOrEqual',
]);
const COMPARISONS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

function containsClock(node) {
  if (!node) return false;
  if (ts.isIdentifier(node) && DURATION_NAME.test(node.text)) return true;
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'now' &&
    ts.isIdentifier(node.expression.expression) &&
    ['Date', 'performance'].includes(node.expression.expression.text)
  )
    return true;
  return Boolean(ts.forEachChild(node, containsClock));
}

function containsTimedComparison(node) {
  if (!node) return false;
  if (
    ts.isBinaryExpression(node) &&
    COMPARISONS.has(node.operatorToken.kind) &&
    (containsClock(node.left) || containsDuration(node.right))
  )
    return true;
  return Boolean(ts.forEachChild(node, containsTimedComparison));
}

function containsDuration(node) {
  if (!node) return false;
  if (ts.isIdentifier(node) && DURATION_NAME.test(node.text)) return true;
  // A clock on the threshold side is commonly an absolute expiry check.
  // Reversed elapsed-time budgets instead compare a duration or clock delta.
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.MinusToken &&
    containsClock(node)
  )
    return true;
  return Boolean(ts.forEachChild(node, containsDuration));
}

function isWallClockAssertion(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (
    (ts.isIdentifier(callee) && callee.text === 'assert') ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'assert' &&
      callee.name.text === 'ok')
  ) {
    return containsTimedComparison(node.arguments[0]);
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    MATCHERS.has(callee.name.text) &&
    ts.isCallExpression(callee.expression) &&
    ts.isIdentifier(callee.expression.expression) &&
    callee.expression.expression.text === 'expect' &&
    (containsClock(callee.expression.arguments[0]) ||
      containsDuration(node.arguments[0]))
  );
}

/** Returns the 1-based line numbers of wall-clock assertions in `source`. */
export function findWallClockAssertions(source, file = 'x.test.mjs') {
  const lines = source.split('\n');
  if (file.endsWith('.py')) {
    return lines.flatMap((line, index) =>
      PY_PATTERNS.some(pattern => pattern.test(line)) &&
      !OPT_OUT.test(line) &&
      !OPT_OUT.test(lines[index - 1] ?? '')
        ? [index + 1]
        : []
    );
  }
  // Parse executable calls, not quoted fixtures or comments. The parser also
  // owns statement boundaries, including wrapping and semicolon-free code.
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  const assertions = [];
  const directives = new Map();
  const lineAt = position => tree.getLineAndCharacterOfPosition(position).line;
  function visit(node) {
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ]) {
      if (OPT_OUT.test(source.slice(range.pos, range.end))) {
        directives.set(range.pos, range);
      }
    }
    if (isWallClockAssertion(node)) assertions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return [
    ...new Set(
      assertions
        .filter(node => {
          const start = node.getStart(tree);
          return ![...directives.values()].some(range => {
            if (range.pos >= start && range.end <= node.end) return true;
            if (range.end <= start) {
              const lineStart = source.lastIndexOf('\n', range.pos - 1) + 1;
              return (
                source.slice(lineStart, range.pos).trim() === '' &&
                source.slice(range.end, start).trim() === ''
              );
            }
            return (
              lineAt(range.pos) === lineAt(node.end) &&
              /^\s*;?\s*$/.test(source.slice(node.end, range.pos))
            );
          });
        })
        .map(node => lineAt(node.getStart(tree)) + 1)
    ),
  ];
}

export function listGatingTestFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(
      file =>
        TEST_FILE.test(file) &&
        !PERF_FILE.test(file) &&
        !EXCLUDED_DIR.test(file)
    );
}

export function scanRepo(repoRoot) {
  const counts = {};
  for (const file of listGatingTestFiles(repoRoot)) {
    let source;
    try {
      source = readFileSync(`${repoRoot}/${file}`, 'utf8');
    } catch {
      continue;
    }
    const hits = findWallClockAssertions(source, file);
    if (hits.length > 0) counts[file] = hits.length;
  }
  return counts;
}
