import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectCatalogVisibleSkills } from './skill-catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('agent web is Playwright only; browse daemon is gone', () => {
  const claude = read('CLAUDE.md');
  const gstack = read('.claude/rules/gstack.md');
  for (const text of [claude, gstack]) {
    assert.match(text, /Playwright/);
    assert.doesNotMatch(text, /`\/browse` is optional/);
    assert.doesNotMatch(text, /Always use the `\/browse` skill/);
    assert.doesNotMatch(text, /Web browsing: `\/browse` only/);
  }
  assert.match(claude, /Playwright only/);
  assert.match(gstack, /Playwright only/);
  assert.match(claude, /CLAUDE\.md stays a router/);
  assert.equal(
    existsSync(join(ROOT, '.agents/skills/gstack/browse/SKILL.md')),
    false
  );
  assert.equal(existsSync(join(ROOT, '.claude/skills/browse/SKILL.md')), false);
  assert.equal(
    existsSync(
      join(ROOT, '.agents/skills/gstack/setup-browser-cookies/SKILL.md')
    ),
    false
  );
  const names = collectCatalogVisibleSkills({ root: ROOT }).map(
    entry => entry.name
  );
  assert.equal(names.includes('browse'), false);
  assert.equal(names.includes('setup-browser-cookies'), false);
  const settings = read('.claude/settings.json');
  assert.doesNotMatch(settings, /Skill\(browse\)/);
  assert.doesNotMatch(settings, /SlashCommand\(\/browse\)/);
  assert.doesNotMatch(settings, /browse\/dist\/browse/);
  const setup = read('.agents/skills/gstack/setup');
  assert.doesNotMatch(setup, /browse binary missing/);
  assert.match(setup, /Skipping gstack browse binary/);
});

test('Husky pre-commit stays the lint ladder, not QA suites', () => {
  const preCommit = read('.husky/pre-commit');
  assert.doesNotMatch(preCommit, /vitest|playwright/i);
  assert.match(preCommit, /lint-staged/);
  const testing = read('.claude/rules/testing.md');
  assert.match(testing, /Do not add Vitest or Playwright suites to pre-commit/);
});
