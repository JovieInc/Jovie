import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const workflow =
  /** @type {{jobs: Record<string, {steps: {id?: string, run: string}[]}>}} */ (
    load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  );
const profile = workflow.jobs['ci-golden-path'].steps.find(
  step => step.id === 'canonical_profile'
);
const navigation = readFileSync(
  join(root, 'apps/web/tests/e2e/canonical-artist-navigation.spec.ts'),
  'utf8'
);

describe('canonical profile JSON handoff', () => {
  it.each([
    ['success', '{"failed":false,"reportPath":"report.json"}', 0, true],
    ['failed', '{"failed":true,"reason":"upstream 503"}', 1, true],
    ['malformed', '{broken', 1, false],
  ])(
    'executes the workflow command with %s producer output',
    (_label, output, status, valid) => {
      const dir = mkdtempSync(join(tmpdir(), 'profile-handoff-'));
      try {
        mkdirSync(join(dir, 'apps/web/node_modules/.bin'), { recursive: true });
        writeFileSync(
          join(dir, 'pnpm-workspace.yaml'),
          'packages:\n  - apps/web\n'
        );
        writeFileSync(join(dir, 'package.json'), '{"private":true}');
        writeFileSync(
          join(dir, 'apps/web/package.json'),
          '{"name":"@jovie/web","version":"1.0.0"}'
        );
        writeFileSync(
          join(dir, 'apps/web/node_modules/.bin/tsx'),
          '#!/usr/bin/env node\nprocess.stdout.write(process.env.FIXTURE_OUTPUT); process.exitCode = Number(process.env.FIXTURE_STATUS);\n',
          { mode: 0o755 }
        );
        const resultPath = join(dir, 'result.json');
        const run = spawnSync('bash', ['-e', '-c', profile.run], {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PROFILE_RESULT: resultPath,
            PROFILE_CERT_DIR: join(dir, 'cert'),
            FIXTURE_OUTPUT: output,
            FIXTURE_STATUS: String(status),
            CI: 'true',
          },
        });
        expect(run.status).toBe(status);
        const artifact = readFileSync(resultPath, 'utf8');
        if (valid) expect(JSON.parse(artifact)).toEqual(JSON.parse(output));
        else expect(() => JSON.parse(artifact)).toThrow();
        if (status !== 0)
          expect(run.stdout + run.stderr).toContain(
            'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL'
          );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it('rejects failed profile evidence before opening the report or making requests', () => {
    const start = navigation.indexOf('const result = JSON.parse');
    const end = navigation.indexOf(
      '\n      }\n      const revision = async',
      start
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const readResult = new Function(
      'resultPath',
      'readFileSync',
      'expect',
      `let expectedRevision; ${navigation.slice(start, end)}; return expectedRevision;`
    );
    const calls = [];
    const read = path => {
      calls.push(path);
      return JSON.stringify({ failed: true, reportPath: 'report.json' });
    };
    expect(() => readResult('result.json', read, expect)).toThrow();
    expect(calls).toEqual(['result.json']);
    const sha = 'a'.repeat(40);
    expect(
      readResult(
        'result.json',
        path =>
          path === 'result.json'
            ? JSON.stringify({ failed: false, reportPath: 'report.json' })
            : JSON.stringify({ snapshot: { releaseSha: sha } }),
        expect
      )
    ).toBe(sha);
  });
});
