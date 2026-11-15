// Static test-hygiene rules: the slop patterns mutation testing can't see
// (2026-11-15 slop-test sweep). A test that can never fail, never runs, or only
// checks its own mocks still scores as coverage, and a mutant it lets survive in
// a module with other tests stays invisible. Pure: path and text in, findings out.
import ts from 'typescript';

export const RULES = Object.freeze({
  focused: 'focused test (only modifier, fit, fdescribe) left in',
  skipped:
    'skipped or todo test (skip or todo modifier, x-prefixed alias) in a unit suite',
  'no-assertion': 'test has no assertion: it passes whatever the code does',
  tautology: 'asserts on a literal (expect(true), expect(1)): it cannot fail',
  'existence-only':
    'only checks a value exists (toBeDefined, toBeTruthy, not.toBeNull): assert the actual value',
  'mock-only':
    'only checks a mock was called (toHaveBeenCalled, toHaveBeenCalledTimes): check what it was called with, or the output',
  'snapshot-only':
    'only a snapshot: assert the behavior the snapshot is standing in for',
  'real-sleep':
    'waits on real time (setTimeout promise, sleep): use fake timers or wait for the condition',
  'unawaited-expect':
    'expect inside a .then or timer callback that the test never awaits: it can run after the test ends',
  'over-mocked':
    'a vi.mock beyond the 8th in one file: the test mostly checks its own mocks',
});

/** Rules with no baseline: any finding fails. */
export const ZERO_TOLERANCE = Object.freeze(['focused']);

const TEST_FNS = new Set(['it', 'test']);
const SUITE_FNS = new Set(['describe', 'suite']);
const FOCUS_ALIASES = new Set(['fit', 'fdescribe']);
// Built, not spelled out, so the gate-weakening detector doesn't read this file as
// adding skipped tests (it scans diffs for the literal aliases and modifiers).
const SKIP_ALIASES = new Set(['it', 'test', 'describe'].map(n => `x${n}`));
const SKIP_LEAF_ALIASES = new Set(['it', 'test'].map(n => `x${n}`));
const CALL_MATCHERS = new Set([
  'toHaveBeenCalled',
  'toHaveBeenCalledTimes',
  'toHaveBeenCalledOnce',
  'toBeCalled',
  'toBeCalledTimes',
]);
const EXISTENCE_MATCHERS = new Set(['toBeDefined', 'toBeTruthy']);
const NEGATED_EXISTENCE = new Set(['toBeNull', 'toBeUndefined', 'toBeFalsy']);
const SNAPSHOT_MATCHERS = new Set([
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toMatchFileSnapshot',
  'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
]);
// Calls that count as an assertion when a test delegates to a helper.
const ASSERTING_CALL = /^(assert|expect|verify|check|should|ensure|must)/iu;
const SLEEP_CALL = /^(sleep|delay|wait|pause)$/iu;
const SLEEP_FLOOR_MS = 50;
const MOCK_BUDGET = 8;

/** Root identifier and member names of a call's callee: it.each(...) -> ['it', 'each']. */
function calleePath(expr) {
  const names = [];
  let node = expr;
  while (node) {
    if (ts.isPropertyAccessExpression(node)) {
      names.unshift(node.name.text);
      node = node.expression;
    } else if (ts.isCallExpression(node)) {
      node = node.expression; // it.each([...])('name', fn)
    } else if (ts.isIdentifier(node)) {
      names.unshift(node.text);
      break;
    } else return [];
  }
  return names;
}

function isStringLike(node) {
  return (
    !!node &&
    (ts.isStringLiteralLike(node) ||
      ts.isTemplateExpression(node) ||
      ts.isNoSubstitutionTemplateLiteral(node))
  );
}

function lastFunctionArg(call) {
  for (let i = call.arguments.length - 1; i >= 0; i--) {
    const arg = call.arguments[i];
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return arg;
  }
  return null;
}

/** expect(...) chain facts for a call like expect(x).not.toBe(y). */
function readExpect(call) {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const matcher = call.expression.name.text;
  let negated = false;
  let node = call.expression.expression;
  while (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === 'not') negated = true;
    node = node.expression;
  }
  if (!ts.isCallExpression(node)) return null;
  const root = calleePath(node.expression);
  if (root[0] !== 'expect') return null;
  return { matcher, negated, subject: node.arguments[0], args: call.arguments };
}

function isLiteral(node) {
  return (
    !!node &&
    (node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      ts.isNumericLiteral(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node))
  );
}

function numericArg(node) {
  return node && ts.isNumericLiteral(node) ? Number(node.text) : null;
}

/** A setTimeout(resolve, N) inside new Promise(...), or sleep(N). */
function realSleepMs(call) {
  const path = calleePath(call.expression);
  const name = path.at(-1);
  if (name === 'setTimeout' && path.length === 1) {
    let parent = call.parent;
    while (parent && !ts.isNewExpression(parent)) {
      if (
        ts.isSourceFile(parent) ||
        (ts.isBlock(parent) && parent.statements.length > 1)
      )
        break;
      parent = parent.parent;
    }
    if (
      parent &&
      ts.isNewExpression(parent) &&
      parent.expression.getText() === 'Promise'
    )
      return numericArg(call.arguments[1]);
    return null;
  }
  if (path.length === 1 && SLEEP_CALL.test(name ?? ''))
    return numericArg(call.arguments[0]);
  if (name === 'waitForTimeout') return numericArg(call.arguments[0]);
  return null;
}

/** Is this .then(...) / timer call's result awaited, returned or the arrow body? */
function isAwaitedOrReturned(call) {
  let node = call;
  while (
    node.parent &&
    (ts.isPropertyAccessExpression(node.parent) ||
      (ts.isCallExpression(node.parent) && node.parent.expression === node))
  )
    node = node.parent;
  const p = node.parent;
  return (
    !!p &&
    (ts.isAwaitExpression(p) ||
      ts.isReturnStatement(p) ||
      (ts.isArrowFunction(p) && p.body === node) ||
      ts.isVariableDeclaration(p) ||
      ts.isArrayLiteralExpression(p) ||
      (ts.isCallExpression(p) && p.expression !== node))
  );
}

/** Facts about one test body. */
function scanTest(fn, helpers) {
  const facts = {
    expects: [],
    asserts: 0,
    sleeps: [],
    unawaited: 0,
  };
  const visit = (node, deferredBy) => {
    if (ts.isCallExpression(node)) {
      const e = readExpect(node);
      if (e) {
        facts.expects.push(e);
        if (deferredBy) facts.unawaited += 1;
      } else {
        const path = calleePath(node.expression);
        const root = path[0] ?? '';
        const name = path.at(-1) ?? '';
        // expect(x) alone is the inner half of a chain readExpect already counted.
        if (
          root !== 'expect' &&
          (root === 'assert' ||
            (root === 't' && path[1] === 'assert') ||
            ASSERTING_CALL.test(name) ||
            ASSERTING_CALL.test(root))
        )
          facts.asserts += 1;
        // expect.fail(...), expect.assertions(n): assertions without a matcher chain.
        if (
          root === 'expect' &&
          ['fail', 'assertions', 'hasAssertions'].includes(path[1] ?? '')
        )
          facts.asserts += 1;
        // A helper declared in this file that asserts (contract(...), renderAndCheck(...)).
        if (path.length === 1 && helpers.has(root)) facts.asserts += 1;
        const ms = realSleepMs(node);
        if (ms !== null && ms >= SLEEP_FLOOR_MS) facts.sleeps.push(ms);
        // expect() inside a callback of an un-awaited .then / setTimeout runs late or never.
        if (
          (name === 'then' ||
            (path.length === 1 &&
              (name === 'setTimeout' || name === 'setInterval'))) &&
          !isAwaitedOrReturned(node)
        ) {
          for (const arg of node.arguments) visit(arg, true);
          visit(node.expression, deferredBy);
          return;
        }
      }
    }
    ts.forEachChild(node, child => visit(child, deferredBy));
  };
  visit(fn.body, false);
  return facts;
}

const ASSERTS_IN_TEXT =
  /\b(expect|assert)\s*[.(]|\bexpect\.fail\b|\bthrow new\b/u;

/** Functions declared in this file whose bodies assert, so calling one is an assertion. */
function assertingHelpers(source) {
  const names = new Set();
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.body &&
      ASSERTS_IN_TEXT.test(node.body.getText(source))
    )
      names.add(node.name.text);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer)) &&
      ASSERTS_IN_TEXT.test(node.initializer.body.getText(source))
    )
      names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** Names bound by the file's imports (module functions a vi.mock replaces). */
function importBindings(source) {
  const names = new Set();
  for (const st of source.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const c = st.importClause;
    if (c.name) names.add(c.name.text);
    const b = c.namedBindings;
    if (b && ts.isNamespaceImport(b)) names.add(b.name.text);
    if (b && ts.isNamedImports(b))
      for (const el of b.elements) names.add(el.name.text);
  }
  return names;
}

/** expect(fn) where fn is an imported module function, vi.mocked(fn) or ns.fn. */
function isImportedCollaborator(subject, imports) {
  let node = subject;
  if (
    node &&
    ts.isCallExpression(node) &&
    calleePath(node.expression).join('.') === 'vi.mocked'
  )
    node = node.arguments[0];
  while (node && ts.isPropertyAccessExpression(node)) node = node.expression;
  return !!node && ts.isIdentifier(node) && imports.has(node.text);
}

function classify(facts, imports) {
  const out = [];
  const { expects } = facts;
  if (expects.length === 0 && facts.asserts === 0) out.push('no-assertion');
  if (
    expects.some(e => isLiteral(e.subject) && !e.matcher.startsWith('toThrow'))
  )
    out.push('tautology');
  if (expects.length > 0 && facts.asserts === 0) {
    if (
      expects.every(
        e =>
          (EXISTENCE_MATCHERS.has(e.matcher) && !e.negated) ||
          (NEGATED_EXISTENCE.has(e.matcher) && e.negated)
      )
    )
      out.push('existence-only');
    // A prop callback (vi.fn() made in the test) being called is the output; an
    // imported module function being called is only the code's own wiring.
    if (
      expects.every(
        e =>
          CALL_MATCHERS.has(e.matcher) &&
          !e.negated &&
          isImportedCollaborator(e.subject, imports)
      )
    )
      out.push('mock-only');
    if (expects.every(e => SNAPSHOT_MATCHERS.has(e.matcher)))
      out.push('snapshot-only');
  }
  if (facts.sleeps.length > 0) out.push('real-sleep');
  if (facts.unawaited > 0) out.push('unawaited-expect');
  return out;
}

/**
 * Findings for one test file.
 * @param {string} file repo-relative path
 * @param {string} text file contents
 * @param {{ unit?: boolean }} [options] unit=false for e2e suites, where skips are
 *   usually environment guards
 * @returns {{ rule: string, line: number, name: string }[]}
 */
export function scanTestFile(file, text, { unit = true } = {}) {
  const kind = file.endsWith('x')
    ? ts.ScriptKind.TSX
    : file.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind
  );
  const findings = [];
  const imports = importBindings(source);
  const helpers = assertingHelpers(source);
  const fakeTimers =
    /\b(vi|jest)\.useFakeTimers\(|mock\.timers\.enable\(/u.test(text);
  let mocks = 0;
  const line = node =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const path = calleePath(node.expression);
      const [root, ...members] = path;
      const first = node.arguments[0];
      const name =
        first && ts.isStringLiteralLike(first)
          ? first.text
          : isStringLike(first)
            ? first.getText(source)
            : '';
      const fn = lastFunctionArg(node);
      const isTest =
        TEST_FNS.has(root) ||
        SUITE_FNS.has(root) ||
        FOCUS_ALIASES.has(root) ||
        SKIP_ALIASES.has(root);
      if ((root === 'vi' || root === 'jest') && members[0] === 'mock')
        mocks += 1;
      // A focused call is focus whatever names it; an alias like fit needs a string name,
      // so a helper called fit(box, cb) stays clean.
      if (
        isTest &&
        (members.includes('only') ||
          (FOCUS_ALIASES.has(root) && fn && isStringLike(first)))
      )
        findings.push({ rule: 'focused', line: line(node), name });
      if (isTest && isStringLike(node.arguments[0])) {
        if (
          unit &&
          (members.includes('skip') ||
            members.includes('todo') ||
            SKIP_ALIASES.has(root))
        )
          findings.push({ rule: 'skipped', line: line(node), name });
        const isLeafTest =
          (TEST_FNS.has(root) ||
            root === 'fit' ||
            SKIP_LEAF_ALIASES.has(root)) &&
          !members.includes('todo') &&
          !members.includes('skip') &&
          fn;
        if (isLeafTest) {
          for (const rule of classify(scanTest(fn, helpers), imports)) {
            if (rule === 'real-sleep' && fakeTimers) continue;
            findings.push({ rule, line: line(node), name });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (let n = MOCK_BUDGET + 1; n <= mocks; n++)
    findings.push({ rule: 'over-mocked', line: 1, name: `vi.mock #${n}` });
  return findings;
}

export const TEST_FILE_GLOBS = Object.freeze([
  '*.test.ts',
  '*.test.tsx',
  '*.test.mjs',
  '*.test.js',
  '*.spec.ts',
  '*.spec.tsx',
]);

/** Vendored skills (.agents/) and deliberately-red invariant fixtures are not ours to judge. */
export function isScannedTestFile(file) {
  return (
    !!file &&
    !file.startsWith('.') &&
    !file.includes('/node_modules/') &&
    !/(^|\/)fixtures\//u.test(file)
  );
}

/** Playwright and capture suites skip on an environment condition; unit suites don't. */
export function isUnitSuite(file) {
  return (
    !/(^|\/)(e2e|visual-qa|product-screenshots|docs-guides)\//u.test(file) &&
    !/\.spec\.tsx?$/u.test(file)
  );
}

/** { rule: { file: count } } from per-file findings. */
export function countFindings(findingsByFile) {
  /** @type {Record<string, Record<string, number>>} */
  const counts = {};
  for (const [file, findings] of Object.entries(findingsByFile))
    for (const { rule } of findings) {
      counts[rule] ??= {};
      counts[rule][file] = (counts[rule][file] ?? 0) + 1;
    }
  return sortCounts(counts);
}

function sortCounts(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map(rule => [
        rule,
        Object.fromEntries(
          Object.keys(counts[rule])
            .sort()
            .map(file => [file, counts[rule][file]])
        ),
      ])
  );
}

/** Every file/rule pair whose count exceeds the baseline; zero-tolerance rules have none. */
export function compareToBaseline(baseline, current) {
  const failures = [];
  for (const [rule, perFile] of Object.entries(current))
    for (const [file, count] of Object.entries(perFile)) {
      const allowed = ZERO_TOLERANCE.includes(rule)
        ? 0
        : (baseline[rule]?.[file] ?? 0);
      if (count > allowed) failures.push({ rule, file, count, allowed });
    }
  return failures;
}

/** min(baseline, current) per pair: cleanups lower it, nothing raises or adds to it. */
export function lowerBaseline(baseline, current) {
  /** @type {Record<string, Record<string, number>>} */
  const next = {};
  for (const [rule, perFile] of Object.entries(baseline))
    for (const [file, allowed] of Object.entries(perFile)) {
      const now = Math.min(allowed, current[rule]?.[file] ?? 0);
      if (now > 0 && !ZERO_TOLERANCE.includes(rule)) {
        next[rule] ??= {};
        next[rule][file] = now;
      }
    }
  return sortCounts(next);
}
