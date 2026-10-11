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

  it.each([true, false])(
    'runs the actual emitter and runner with quarantined units present=%s',
    populated => {
      const fixture = mkdtempSync(join(tmpdir(), 'quarantine-runner-ledger-'));
      const unitFile = 'tests/unit/utils/capitalizeFirst.test.ts';
      try {
        mkdirSync(join(fixture, 'tests'));
        const ledger = JSON.parse(
          readFileSync(join(WEB_ROOT, 'tests/quarantine.json'), 'utf8')
        );
        ledger.entries = populated
          ? [
              {
                id: 'unit-runner-fixture',
                kind: 'unit',
                path: unitFile,
                owner: 'platform',
                firstSeenAt: '2026-02-10',
                expiresAt: '2099-12-31',
                consecutiveSuccesses: 0,
                reproductionCommand: `pnpm --filter @jovie/web exec vitest run ${unitFile}`,
                fixIssueUrl: 'https://linear.app/jovie/issue/JOV-6507',
              },
            ]
          : [];
        writeFileSync(
          join(fixture, 'tests/quarantine.json'),
          JSON.stringify(ledger)
        );
        const emitted = spawnSync(
          resolve(WEB_ROOT, 'node_modules/.bin/tsx'),
          [
            '--tsconfig',
            resolve(WEB_ROOT, 'tsconfig.json'),
            resolve(WEB_ROOT, 'scripts/emit-quarantine-github-output.ts'),
          ],
          {
            cwd: fixture,
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
        expect(outputs.has_unit).toBe(populated ? 'true' : 'false');
        const excludes = outputs.unit_excludes.split(' ').filter(Boolean);
        const quarantined = outputs.unit_files.split(' ').filter(Boolean);
        expect(quarantined).toEqual(populated ? [unitFile] : []);
        expect(excludes).toEqual(populated ? [`--exclude=${unitFile}`] : []);
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
            unitFile,
            'tests/unit/utils/public-url.test.ts',
          ],
          {
            cwd: WEB_ROOT,
            encoding: 'utf8',
            env: { ...process.env, CI: 'true' },
          }
        );
        const output = `${result.stdout}\n${result.stderr}`;
        expect(result.status, output).toBe(0);
        expect(output).toContain('public-url.test.ts');
        if (populated) expect(output).not.toContain(unitFile);
        else expect(output).toContain(unitFile);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
    60_000
  );
});
