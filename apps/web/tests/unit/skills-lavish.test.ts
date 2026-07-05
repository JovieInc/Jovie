import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ponytail: one test file to lock the lavish skill installation; fails if the
// skill is removed or skills-lock.json is corrupted.

// tests/unit/skills-lavish.test.ts → tests/unit → tests → apps/web → apps → repo root
const repoRoot = join(fileURLToPath(import.meta.url), '../../../../../');

describe('lavish skill installation', () => {
  it('SKILL.md exists at .claude/skills/lavish/SKILL.md', () => {
    const skillPath = join(repoRoot, '.claude/skills/lavish/SKILL.md');
    expect(existsSync(skillPath), `missing: ${skillPath}`).toBe(true);
  });

  it('SKILL.md declares the lavish skill name and author', () => {
    const skillPath = join(repoRoot, '.claude/skills/lavish/SKILL.md');
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('name: lavish');
    expect(content).toContain('kunchenguid');
    // core capability: open HTML in browser for annotation
    expect(content).toContain('lavish-axi');
  });

  it('skills-lock.json contains the lavish entry pointing to kunchenguid/lavish-axi', () => {
    const lockPath = join(repoRoot, 'skills-lock.json');
    expect(existsSync(lockPath), `missing: ${lockPath}`).toBe(true);
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    expect(lock.skills).toHaveProperty('lavish');
    expect(lock.skills.lavish.source).toBe('kunchenguid/lavish-axi');
  });

  it('gstack routing table mentions lavish for HTML artifact review loop', () => {
    const gstackPath = join(repoRoot, '.claude/rules/gstack.md');
    const content = readFileSync(gstackPath, 'utf8');
    expect(content).toContain('/lavish');
    // verify it is in the routing rules, not just the table
    expect(content).toContain('HTML artifact');
  });
});
