import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWebVitestFastArgs } from '../ci-web-vitest-fast-args.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PASS_WITH_NO_TESTS = '--passWithNoTests';

describe('web test:fast runner', () => {
  it('keeps exactly one passWithNoTests option', () => {
    expect(buildWebVitestFastArgs(['--shard=5/10'])).toEqual([
      'run',
      '--config=vitest.config.mts',
      PASS_WITH_NO_TESTS,
      '--shard=5/10',
    ]);

    const duplicate = buildWebVitestFastArgs([
      PASS_WITH_NO_TESTS,
      '--shard=5/10',
      PASS_WITH_NO_TESTS,
    ]);
    expect(duplicate.filter(arg => arg === PASS_WITH_NO_TESTS)).toHaveLength(1);

    expect(
      buildWebVitestFastArgs([
        '--',
        '--passWithNoTests=false',
        '--passWithNoTests=false',
      ])
    ).toEqual(['run', '--config=vitest.config.mts', '--passWithNoTests=false']);
  });

  it('accepts the CI forwarded flag through the real Turbo runner path', () => {
    const result = spawnSync(
      'pnpm',
      [
        'turbo',
        'test:fast',
        '--filter=@jovie/web',
        '--force',
        '--',
        '--pool=forks',
        '--maxWorkers=1',
        '--retry=0',
        PASS_WITH_NO_TESTS,
        'tests/unit/utils/capitalizeFirst.test.ts',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
      }
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).not.toContain(
      'Expected a single value for option "--passWithNoTests"'
    );
    expect(output).toContain('capitalizeFirst.test.ts');
  }, 20_000);
});
