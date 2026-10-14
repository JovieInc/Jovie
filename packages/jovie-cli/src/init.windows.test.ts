import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const renameSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  renameSync,
}));

import { installSkill } from './init.js';
import { SKILL_MD } from './skill.js';

describe('jovie init on Windows', () => {
  it('accepts an identical skill installed by a concurrent process', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-init-windows-race-'));
    const target = join(dir, 'jovie');
    mkdirSync(target);
    writeFileSync(join(target, 'SKILL.md'), SKILL_MD);
    renameSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('destination is busy'), { code: 'EPERM' });
    });

    expect(installSkill('/nonexistent', dir).installed).toEqual([
      join(target, 'SKILL.md'),
    ]);
    expect(readdirSync(target)).toEqual(['SKILL.md']);
  });
});
