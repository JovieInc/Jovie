import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWebVitestFastArgs,
  readCliExcludePatterns,
} from '../ci-web-vitest-fast-args.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WEB_ROOT = resolve(REPO_ROOT, 'apps', 'web');
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
    // Real pnpm -> turbo --force -> web Vitest boot: measured 7.8s idle and
    // 17.7s under ci-fast CPU contention, too close to the former 20s budget.
  }, 60_000);

  it('reads every CLI --exclude form the quarantine ledger can emit', () => {
    expect(
      readCliExcludePatterns([
        'node',
        'vitest',
        'run',
        '--exclude=tests/unit/ci/deploy-workflow.test.ts',
        '--exclude',
        'tests/lib/utils/url-encryption.test.ts',
        '--exclude',
        '--shard=8/10',
        '--exclude=',
      ])
    ).toEqual([
      'tests/unit/ci/deploy-workflow.test.ts',
      'tests/lib/utils/url-encryption.test.ts',
    ]);
  });

  it('keeps ledger-quarantined unit files out of the main test:fast run', () => {
    // Vitest forwards CLI --exclude to the root config only, not to the
    // node/jsdom `projects`; merge-group shards ran every quarantined file
    // (blocking) despite the ledger's --exclude flags. Drive the real ledger
    // emitter and the real runner/config so that wiring cannot regress.
    const emitted = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/emit-quarantine-github-output.ts'],
      {
        cwd: WEB_ROOT,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: '' },
      }
    );
    expect(emitted.status, emitted.stderr).toBe(0);
    const outputs = Object.fromEntries(
      emitted.stdout
        .split('\n')
        .filter(line => line.includes('='))
        .map(line => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1),
        ])
    );
    expect(outputs.has_unit).toBe('true');
    const excludes = outputs.unit_excludes.split(' ').filter(Boolean);
    const quarantined = outputs.unit_files.split(' ').filter(Boolean);
    expect(quarantined.length).toBeGreaterThan(0);
    expect(excludes).toEqual(quarantined.map(file => `--exclude=${file}`));

    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'node',
        'scripts/test-fast.mjs',
        '--pool=forks',
        '--maxWorkers=1',
        '--retry=0',
        ...excludes,
        ...quarantined,
        'tests/unit/utils/capitalizeFirst.test.ts',
      ],
      {
        cwd: WEB_ROOT,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
      }
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toContain('capitalizeFirst.test.ts');
    for (const file of quarantined) expect(output).not.toContain(file);
  }, 60_000);
});
