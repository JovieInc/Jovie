import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  collectCatalogVisibleSkills,
  evaluateSkillCatalog,
} from './skill-catalog.mjs';

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

test('the current repository has unique catalog-visible leaf names', () => {
  assert.deepEqual(evaluateSkillCatalog(), []);
  const names = collectCatalogVisibleSkills().map(entry => entry.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('browse'));
  assert.ok(names.includes('ship'));
});

test('nested adapter copies do not create a second catalog name', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-skill-catalog-'));
  try {
    write(root, '.claude/skills/browse/SKILL.md', 'canonical\n');
    write(root, '.agents/skills/gstack/browse/SKILL.md', 'checkout leaf\n');
    write(
      root,
      '.agents/skills/gstack/.factory/skills/gstack-browse/SKILL.md',
      'adapter\n'
    );
    write(
      root,
      '.claude/skills/RESOLVER.md',
      '- **browse**: .claude/skills/browse\n'
    );
    const catalog = collectCatalogVisibleSkills({ root });
    assert.deepEqual(
      catalog.map(entry => entry.name),
      ['browse']
    );
    assert.equal(catalog[0].paths.length, 2);
    assert.deepEqual(evaluateSkillCatalog({ root }), []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('fails when RESOLVER.md omits a unique leaf', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-skill-catalog-miss-'));
  try {
    write(root, '.claude/skills/browse/SKILL.md', 'canonical\n');
    write(root, '.claude/skills/RESOLVER.md', '- **other**: nowhere\n');
    const errors = evaluateSkillCatalog({ root }).join('\n');
    assert.match(errors, /missing unique leaf \*\*browse\*\*/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
