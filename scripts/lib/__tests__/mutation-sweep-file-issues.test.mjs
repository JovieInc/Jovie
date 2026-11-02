import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve(
  import.meta.dirname,
  '../../mutation-sweep-file-issues.mjs'
);

const run = (dir, env = {}) =>
  spawnSync(process.execPath, [script, '--tasks', dir], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });

describe('mutation-sweep-file-issues', () => {
  it('reports nothing for a missing task directory', () => {
    const res = run(join(tmpdir(), 'no-such-mutation-tasks'));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('0 survivor issue(s) filed from 0 task');
  });

  it('dry-runs without LINEAR_API_KEY and skips modules with no survivors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mutation-tasks-'));
    writeFileSync(
      join(dir, 'a.json'),
      JSON.stringify({
        file: 'lib/a.ts',
        score: 50,
        valid: 10,
        tests: [],
        survivors: [],
      })
    );
    writeFileSync(
      join(dir, 'b.json'),
      JSON.stringify({
        file: 'lib/b.ts',
        sha: 'c'.repeat(40),
        score: 50,
        valid: 10,
        tests: ['lib/b.test.ts'],
        survivors: [
          {
            fingerprint: 'fp1',
            file: 'lib/b.ts',
            line: 3,
            mutator: 'ConditionalExpression',
            status: 'Survived',
            original: 'x > 1',
            replacement: 'true',
            context: 'const y = x > 1;',
          },
        ],
      })
    );
    const res = run(dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('mutation-survivors:lib/b.ts');
    expect(res.stdout).not.toContain('mutation-survivors:lib/a.ts');
    expect(res.stdout).toContain('0 survivor issue(s) filed from 2 task');
  });
});
