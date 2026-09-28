import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { installSkill } from './init.js';
import { SKILL_MD } from './skill.js';

describe('jovie init', () => {
  it('installs only into agents that exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'jovie-init-'));
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.hermes'));

    const result = installSkill(home);

    expect(result.installed).toEqual([
      join(home, '.claude/skills/jovie/SKILL.md'),
      join(home, '.hermes/skills/jovie/SKILL.md'),
    ]);
    expect(result.skipped).toEqual(['codex', 'openclaw']);
    expect(existsSync(join(home, '.openclaw'))).toBe(false);
    expect(readFileSync(result.installed[0], 'utf8')).toBe(SKILL_MD);
  });

  it('writes to an explicit skills dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-skills-'));
    expect(installSkill('/nonexistent', dir).installed).toEqual([
      join(dir, 'jovie/SKILL.md'),
    ]);
  });
});
