import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for GH-10926: last30days skill adoption + Idea Radar wiring.
// Mirrors the lavish skill test pattern (skills-lavish.test.ts).

// tests/unit/skills-last30days.test.ts → tests/unit → tests → apps/web → apps → repo root
const repoRoot = join(fileURLToPath(import.meta.url), '../../../../../');

describe('last30days skill adoption (GH-10926)', () => {
  it('project-level SKILL.md exists at .claude/skills/last30days/SKILL.md', () => {
    const skillPath = join(repoRoot, '.claude/skills/last30days/SKILL.md');
    expect(existsSync(skillPath), `missing: ${skillPath}`).toBe(true);
  });

  it('SKILL.md declares the last30days skill and mvanhorn source', () => {
    const skillPath = join(repoRoot, '.claude/skills/last30days/SKILL.md');
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('name: last30days');
    expect(content).toContain('mvanhorn');
    expect(content).toContain('last30days-skill');
  });

  it('skills-lock.json registers mvanhorn/last30days-skill', () => {
    const lockPath = join(repoRoot, 'skills-lock.json');
    expect(existsSync(lockPath), `missing: ${lockPath}`).toBe(true);
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    expect(lock.skills).toHaveProperty('last30days');
    expect(lock.skills.last30days.source).toBe('mvanhorn/last30days-skill');
  });

  it('gstack routing table routes market research and idea radar to /last30days', () => {
    const gstackPath = join(repoRoot, '.claude/rules/gstack.md');
    const content = readFileSync(gstackPath, 'utf8');
    expect(content).toContain('/last30days');
    expect(content).toContain('market');
    expect(content).toContain('idea-radar');
  });

  it('idea-radar skill exists and references last30days', () => {
    const skillPath = join(repoRoot, '.claude/skills/idea-radar/SKILL.md');
    expect(existsSync(skillPath), `missing: ${skillPath}`).toBe(true);
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('idea-radar');
    expect(content).toContain('/last30days');
    // must cap cost (acceptance criteria)
    expect(content).toContain('cost-cap');
  });

  it('market-research command exists and references last30days', () => {
    const cmdPath = join(repoRoot, '.claude/commands/market-research.md');
    expect(existsSync(cmdPath), `missing: ${cmdPath}`).toBe(true);
    const content = readFileSync(cmdPath, 'utf8');
    expect(content).toContain('/last30days');
    // cost cap required
    expect(content).toContain('$0.30');
  });

  it('Hermes Air config template includes idea-radar schedule', () => {
    const configPath = join(
      repoRoot,
      'scripts/hermes/config.air.template.yaml'
    );
    expect(existsSync(configPath), `missing: ${configPath}`).toBe(true);
    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('idea-radar-sweep');
    expect(content).toContain('0 9 * * 1');
    // must reference the cost cap
    expect(content).toContain('cost_cap_usd');
  });
});
