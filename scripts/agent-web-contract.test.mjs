import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('agent web default is Playwright; /browse is optional', () => {
  const claude = read('CLAUDE.md');
  const gstack = read('.claude/rules/gstack.md');
  for (const text of [claude, gstack]) {
    assert.doesNotMatch(text, /Always use the `\/browse` skill/);
    assert.doesNotMatch(text, /Web browsing: `\/browse` only/);
    assert.match(text, /Playwright/);
    assert.match(text, /`\/browse` is optional/);
  }
  assert.match(claude, /CLAUDE\.md stays a router/);
});

test('Husky pre-commit stays the lint ladder, not QA suites', () => {
  const preCommit = read('.husky/pre-commit');
  assert.doesNotMatch(preCommit, /vitest|playwright/i);
  assert.match(preCommit, /lint-staged/);
  const testing = read('.claude/rules/testing.md');
  assert.match(testing, /Do not add Vitest or Playwright suites to pre-commit/);
});
