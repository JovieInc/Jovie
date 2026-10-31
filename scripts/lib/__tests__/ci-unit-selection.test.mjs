import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { selectedWebUnitMode } from '../../ci-unit-selection.mjs';

const root = resolve(import.meta.dirname, '../../..');
const guard = join(root, 'scripts/ci-unit-selection.mjs');
const turbo = join(root, 'node_modules/.bin/turbo');
function check(plan) {
  return spawnSync(process.execPath, [guard], {
    input: JSON.stringify(plan),
    encoding: 'utf8',
  });
}

describe('selected web unit lane', () => {
  it('fails the actual web runner when the required shard has no matching tests', () => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'node',
        'scripts/test-fast.mjs',
        '--passWithNoTests=false',
        '__jov_10056_nonexistent_test__',
      ],
      {
        cwd: join(root, 'apps/web'),
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
      }
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'No test files found'
    );
  });

  it('fails closed on missing or malformed evidence and selects a conservative fallback', () => {
    const task = {
      taskId: '@jovie/web#test:fast',
      package: '@jovie/web',
      task: 'test:fast',
      command: 'node scripts/test-fast.mjs',
    };
    expect(selectedWebUnitMode({ tasks: [task] })).toBe('affected');
    expect(check({ tasks: [task] }).stdout.trim()).toBe('affected');
    expect(selectedWebUnitMode({ tasks: [] })).toBe('affected-and-web');
    expect(() =>
      selectedWebUnitMode({ tasks: [] }, { requireWeb: true })
    ).toThrow();
    expect(
      selectedWebUnitMode({
        tasks: [
          { ...task, taskId: '@jovie/ovie#test:fast', package: '@jovie/ovie' },
        ],
      })
    ).toBe('affected-and-web');
    for (const plan of [
      {},
      null,
      { tasks: null },
      { tasks: [null] },
      { tasks: [{}] },
      { tasks: [{ ...task, package: '@jovie/ui' }] },
      { tasks: [{ ...task, command: '<NONEXISTENT>' }] },
      { tasks: [{ ...task, command: '' }] },
      { tasks: [task, task] },
    ]) {
      expect(() => selectedWebUnitMode(plan)).toThrow();
      expect(check(plan).status).not.toBe(0);
    }
    expect(
      spawnSync(process.execPath, [guard], {
        input: 'not json',
        encoding: 'utf8',
      }).status
    ).not.toBe(0);
  });

  it('executes the workflow against real Turbo: hidden inputs, sibling packages, shared dependencies, config and no-op', () => {
    // Canonicalize macOS /var -> /private/var so CLI main detection works.
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ci-unit-selection-')));
    try {
      const write = (path, data) => writeFileSync(join(dir, path), data);
      for (const path of [
        'apps/web',
        'apps/ovie',
        'packages/jovie-cli',
        'packages/shared',
        'scripts',
      ])
        mkdirSync(join(dir, path), { recursive: true });
      write(
        'package.json',
        JSON.stringify({
          name: 'selector-fixture',
          private: true,
          packageManager: 'pnpm@9.15.9',
        })
      );
      write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n');
      // Cache is enabled: the fallback must not replay a stale passing web task.
      write('turbo.json', JSON.stringify({ tasks: { 'test:fast': {} } }));
      write('.gitignore', '.turbo\nruntime-input.txt\nunit-selection-*.json\n');
      for (const [path, name, token] of [
        ['apps/web', '@jovie/web', 'WEB_EXECUTED'],
        ['apps/ovie', '@jovie/ovie', 'OVIE_EXECUTED'],
        ['packages/jovie-cli', '@jovie/cli', 'CLI_EXECUTED'],
        ['packages/shared', '@jovie/shared', 'SHARED_EXECUTED'],
      ]) {
        write(
          `${path}/package.json`,
          JSON.stringify({
            name,
            version: '1.0.0',
            // Ovie has no test:fast task today; CLI does. Cover both cases.
            scripts: {
              [name === '@jovie/ovie' ? 'test' : 'test:fast']:
                'node verify.mjs',
            },
            ...(name === '@jovie/web'
              ? { dependencies: { '@jovie/shared': 'workspace:*' } }
              : {}),
          })
        );
        write(
          `${path}/verify.mjs`,
          `import { readFileSync } from 'node:fs';\nconsole.log('${token}');\n` +
            (name === '@jovie/web'
              ? "if (readFileSync('../../runtime-input.txt', 'utf8') !== 'valid') { console.error('INVALID_RUNTIME_INPUT'); process.exitCode = 1; }\n"
              : "if (process.argv.includes('--passWithNoTests=false')) { console.error('SIBLING_EMPTY_SHARD_POLICY_CHANGED'); process.exitCode = 1; }\n")
        );
      }
      copyFileSync(guard, join(dir, 'scripts/ci-unit-selection.mjs'));
      write('runtime-input.txt', 'valid');
      const git = (...args) =>
        execFileSync('git', args, {
          cwd: dir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      const commit = () => {
        git('add', '.');
        git(
          '-c',
          'user.name=CI fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '-qm',
          'fixture'
        );
        return git('rev-parse', 'HEAD').trim();
      };
      git('init', '-q');
      let base = commit();
      const env = {
        ...process.env,
        TURBO_SCM_BASE: base,
        TURBO_SCM_HEAD: base,
        TURBO_TELEMETRY_DISABLED: '1',
        RUNNER_TEMP: dir,
        SHARD_SLUG: '1-1',
        VITEST_CI_FLAGS: '',
        RETRY_FLAG: '',
        OUTPUT_FLAG: '',
        PATH: `${join(root, 'node_modules/.bin')}:${process.env.PATH}`,
      };
      const run = args =>
        spawnSync(turbo, ['run', 'test:fast', ...args], {
          cwd: dir,
          env,
          encoding: 'utf8',
        });
      const dry = () => {
        const result = run(['--affected', '--dry=json']);
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout);
      };
      // Execute the production branch, not a second implementation of it.
      const workflow =
        /** @type {{ jobs: Record<string, { steps: { name: string, run: string }[] }> }} */ (
          load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
        );
      const script = workflow.jobs['ci-unit-tests'].steps.find(
        step => step.name === 'Run unit tests'
      ).run;
      const marker =
        'elif [[ "${{ github.event_name }}" == "merge_group" ]]; then';
      expect(script).toContain(marker);
      const branch = script
        .split(marker)[1]
        .split('\nelse\n')[0]
        .replaceAll('${{ matrix.shard }}', '1/1')
        .replaceAll('${{ steps.quarantine.outputs.unit_excludes }}', '');
      expect(branch).not.toContain('${{');
      const selected = () =>
        spawnSync('bash', ['-eo', 'pipefail', '-c', branch], {
          cwd: dir,
          env,
          encoding: 'utf8',
        });
      const assertGreen = (result, token = 'WEB_EXECUTED') => {
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
        expect(result.stdout).toContain(token);
      };
      const flags = ['--', '--passWithNoTests=false', '--shard=1/1'];
      // Warm exactly the cache key used by the production fallback.
      assertGreen(run(['--filter=@jovie/web', ...flags]));
      write('runtime-input.txt', 'invalid hidden dependency');
      const skipped = run(['--affected', ...flags]);
      expect(skipped.status, skipped.stderr).toBe(0);
      expect(skipped.stdout).not.toContain('WEB_EXECUTED');
      expect(dry().tasks).toEqual([]);
      // Without --force, the explicit task still returns cached success.
      assertGreen(run(['--filter=@jovie/web', ...flags]));
      const caught = selected();
      expect(caught.status).not.toBe(0);
      expect(`${caught.stdout}\n${caught.stderr}`).toContain(
        'INVALID_RUNTIME_INPUT'
      );
      write('runtime-input.txt', 'valid');
      assertGreen(selected()); // Conservatively selected no-op lane is valid.
      /** @type {Array<[path: string, token: string, expectsWeb: boolean]>} */
      const changes = [
        ['apps/ovie/source.js', 'WEB_EXECUTED', false],
        ['packages/jovie-cli/source.js', 'CLI_EXECUTED', false],
        ['apps/web/source.js', 'WEB_EXECUTED', true],
        ['packages/shared/source.js', 'WEB_EXECUTED', true],
        ['turbo.json', 'WEB_EXECUTED', true],
      ];
      for (const [path, token, expectsWeb] of changes) {
        env.TURBO_SCM_BASE = base;
        write(
          path,
          path === 'turbo.json'
            ? JSON.stringify({ tasks: { 'test:fast': { outputs: [] } } })
            : 'export const changed = true;\n'
        );
        base = commit();
        env.TURBO_SCM_HEAD = base;
        expect(
          dry().tasks.some(task => task.taskId === '@jovie/web#test:fast'),
          path
        ).toBe(expectsWeb);
        const result = selected();
        assertGreen(result, token);
        expect(result.stdout).toContain('WEB_EXECUTED');
        expect(result.stdout.includes('Affected graph omitted web')).toBe(
          !expectsWeb
        );
      }
      // A missing web script must not make the explicit fallback another
      // successful zero-task execution.
      write(
        'apps/web/package.json',
        JSON.stringify({ name: '@jovie/web', version: '1.0.0' })
      );
      base = commit();
      env.TURBO_SCM_BASE = base;
      env.TURBO_SCM_HEAD = base;
      const missingWeb = selected();
      expect(missingWeb.status).not.toBe(0);
      expect(missingWeb.stderr).toContain('no unique executable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
