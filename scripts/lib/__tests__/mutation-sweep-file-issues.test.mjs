import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileSurvivorIssues } from '../../mutation-sweep-file-issues.mjs';

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
    expect(res.stdout).toContain(
      '0 survivor issue upsert(s) confirmed from 0 task JSON filename(s)'
    );
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
    const before = readdirSync(dir).map(name => [
      name,
      readFileSync(join(dir, name), 'utf8'),
    ]);
    try {
      const res = run(dir);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('mutation-survivors:lib/b.ts');
      expect(res.stdout).not.toContain('mutation-survivors:lib/a.ts');
      expect(res.stdout).toContain(
        '0 survivor issue upsert(s) confirmed from 2 task JSON filename(s)'
      );
      expect(res.stdout).toContain('not a missing Linear issue count');
      expect(res.stdout).toContain(
        '1 task filename(s) not completed this pass'
      );
      expect(
        readdirSync(dir).map(name => [
          name,
          readFileSync(join(dir, name), 'utf8'),
        ])
      ).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['quota', 'ordinary failure'])(
    'counts %s truthfully without changing task bytes',
    async kind => {
      const dir = mkdtempSync(join(tmpdir(), 'mutation-filing-accounting-'));
      for (const name of ['a', 'b', 'c'])
        writeFileSync(
          join(dir, `${name}.json`),
          JSON.stringify({
            file: `lib/${name}.ts`,
            score: 50,
            valid: 1,
            tests: [],
            survivors: [
              {
                fingerprint: name,
                file: `lib/${name}.ts`,
                line: 1,
                mutator: 'BooleanLiteral',
                status: 'Survived',
                original: 'true',
                replacement: 'false',
                context: 'return true',
              },
            ],
          })
        );
      const before = readdirSync(dir).map(name => [
        name,
        readFileSync(join(dir, name), 'utf8'),
      ]);
      let calls = 0;
      try {
        const result = await fileSurvivorIssues({
          tasksDir: dir,
          enabled: true,
          upsert: /** @type {any} */ (
            async () => {
              calls += 1;
              return kind === 'quota'
                ? { ok: false, reason: 'linear_rate_limited' }
                : calls === 2
                  ? { ok: false, reason: 'linear_search_http' }
                  : { ok: true, action: 'updated' };
            }
          ),
        });
        expect(result).toEqual(
          kind === 'quota' ? { filed: 0, unfiled: 3 } : { filed: 2, unfiled: 1 }
        );
        expect(calls).toBe(kind === 'quota' ? 1 : 3);
        expect(
          readdirSync(dir).map(name => [
            name,
            readFileSync(join(dir, name), 'utf8'),
          ])
        ).toEqual(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
