// Landmine rules for test-hygiene (idea: github.com/interfere-inc/landmines,
// adapted to this repo's shrink-only ratchet pattern; no new dependencies).
// real-sleep already covers fixed sleeps, so this module adds the two rules
// that were missing: mocked-subject and flake-mask. Pure: file/source in,
// findings out. Grandfathered flake-mask counts live in
// scripts/test-quality/test-hygiene-landmines.ratchet.json and only shrink.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export const LANDMINE_RULES = Object.freeze({
  'mocked-subject':
    "mocks the module the test file is named after (vi.mock('./X') in X.test.ts): a green run proves the mock, not the code; mock the unit's dependencies (network/MSW, db, clock, child modules) instead, or use vi.spyOn for pure observation",
  'flake-mask':
    'retries, this.retries, test.retry() or a raised per-test timeout mask nondeterminism: fix the race with a real waitFor condition or fake timers; the reviewed retry budget is the quarantine ledger (apps/web/tests/quarantine.json), not the test file',
});

export const LANDMINE_ZERO_TOLERANCE = Object.freeze(['mocked-subject']);

export const RATCHET_PATH =
  'scripts/test-quality/test-hygiene-landmines.ratchet.json';
export const RATCHET_SCHEMA = 'jovie.test-hygiene-landmines-ratchet/v1';

const SUITE_DEFAULT_TIMEOUT_MS = 5000;

/** 'components/ui/Foo.certificate.test.tsx' -> 'Foo': the module the file is named after. */
export function testSubject(file) {
  const base = file.split('/').pop() ?? file;
  return base
    .replace(/\.[cm]?[jt]sx?$/u, '')
    .split('.')
    .filter(s => !['test', 'spec', 'certificate'].includes(s))
    .join('.');
}

function optName(node) {
  return ts.isIdentifier(node.name)
    ? node.name.text
    : ts.isStringLiteral(node.name)
      ? node.name.text
      : '';
}

/** Numeric literal value with digit separators removed; null otherwise. */
function numLit(node) {
  return node && ts.isNumericLiteral(node)
    ? Number(node.text.replace(/_/gu, ''))
    : null;
}

/**
 * Findings for the landmine rules. `line` is test-hygiene's node-to-line
 * helper, so findings carry the same shape as the built-in rules.
 */
export function landmineFindings(file, source, line) {
  const out = [];
  const push = (rule, name, node) => out.push({ rule, line: line(node), name });
  const subject = testSubject(file);
  const visit = node => {
    // retry:/retries:/testTimeout: keys with a positive retry budget or a
    // raised timeout, in any object (a test option, a helper's nav options, a
    // configure call) convert nondeterminism into a hidden retry budget.
    // `retry: false` (React Query config) and callback props named retry are
    // not budgets and stay clean.
    if (ts.isPropertyAssignment(node)) {
      const name = optName(node);
      const n = numLit(node.initializer);
      if ((name === 'retry' || name === 'retries') && n > 0)
        push('flake-mask', `${name}: ${n}`, node);
      if (name === 'testTimeout' && n !== null && n > SUITE_DEFAULT_TIMEOUT_MS)
        push('flake-mask', `${name}: ${n}`, node);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'retries' &&
      node.expression.kind === ts.SyntaxKind.ThisKeyword
    )
      push('flake-mask', 'this.retries', node);
    if (ts.isCallExpression(node)) {
      const argMs = numLit(node.arguments[0]);
      // test.retry(2) / jest.setTimeout(30000): hidden budgets.
      const path = [];
      let callee = node.expression;
      while (callee && ts.isPropertyAccessExpression(callee)) {
        path.unshift(callee.name.text);
        callee = callee.expression;
      }
      if (ts.isIdentifier(callee)) path.unshift(callee.text);
      if (path.length >= 2 && path.at(-1) === 'retry' && argMs > 0)
        push('flake-mask', `${path.join('.')}(${argMs})`, node);
      if (
        path[0] === 'jest' &&
        path[1] === 'setTimeout' &&
        argMs !== null &&
        argMs > SUITE_DEFAULT_TIMEOUT_MS
      )
        push('flake-mask', `jest.setTimeout(${argMs})`, node);
      // Mocking the module the file is named after (a relative specifier whose
      // basename is the file's subject): a green run proves the mock, not the
      // unit. Alias and package specifiers collide on basename with real
      // dependencies ('@/lib/rate-limit' vs a colocated './rate-limit'), so
      // only relative paths count. Spies and MSW are untouched.
      if ((path[0] === 'vi' || path[0] === 'jest') && path[1] === 'mock') {
        const spec = ts.isStringLiteralLike(node.arguments[0])
          ? node.arguments[0].text
          : '';
        const base = (spec.split('/').pop() ?? spec).replace(
          /\.[cm]?[jt]sx?$/u,
          ''
        );
        if (/^\.{1,2}\//u.test(spec) && base === subject)
          push('mocked-subject', spec, node);
      }
      // A per-test timeout raised above the 5s suite default (vitest/jest) is
      // flake masking; a waitFor/assertion budget is not (not a test arg).
      if (['it', 'test', 'describe', 'suite'].includes(path[0])) {
        for (const arg of node.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue;
          for (const prop of arg.properties) {
            if (!ts.isPropertyAssignment(prop) || optName(prop) !== 'timeout')
              continue;
            const ms = numLit(prop.initializer);
            if (ms !== null && ms > SUITE_DEFAULT_TIMEOUT_MS)
              push('flake-mask', `timeout: ${ms}`, node);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Grandfathered flake-mask counts ({file: {rule: count}}), {} when absent. */
export function loadRatchet(repoRoot) {
  const path = join(repoRoot, RATCHET_PATH);
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.entries ?? {};
}

/** min(ratchet, current) per pair, written back; never raises. */
export function tightenRatchet(repoRoot, current) {
  const entries = {};
  for (const [file, allowed] of Object.entries(loadRatchet(repoRoot))) {
    const now = {};
    for (const [rule, n] of Object.entries(allowed)) {
      const found = current[file]?.[rule] ?? 0;
      if (Math.min(n, found) > 0) now[rule] = Math.min(n, found);
    }
    if (Object.keys(now).length) entries[file] = now;
  }
  writeFileSync(
    join(repoRoot, RATCHET_PATH),
    `${JSON.stringify(
      {
        schema: RATCHET_SCHEMA,
        note: 'Flake-mask sites at the 2026-11-19 landmine bootstrap; counts only go down (node scripts/test-hygiene.mjs --tighten). mocked-subject is never baselined.',
        entries,
      },
      null,
      2
    )}\n`
  );
}
