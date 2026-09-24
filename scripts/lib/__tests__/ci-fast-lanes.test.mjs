import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LANE_COMMANDS,
  runDesignConformance,
  runStructural,
} from '../../ci-fast-lanes.mjs';

const SCREENSHOT_CATALOG_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/screenshot-catalog-pr-workflow.test.ts';
const STRUCTURAL_RUNNER_COVERAGE_COMMAND =
  'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/ci-fast-lanes.test.mjs --coverage --coverage.include=ci-fast-lanes.mjs --coverage.reporter=text --coverage.reporter=json --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-ci-fast-structural-coverage" --coverage.thresholds.statements=30 --coverage.thresholds.lines=32 --coverage.thresholds.branches=24 --coverage.thresholds.functions=27';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('CI control selector', () => {
  it('includes the structural execution regressions in the actual control command', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-ci-control-selector-'));
    const capture = join(directory, 'commands');
    try {
      writeFileSync(join(directory, 'node'), '#!/bin/sh\nexit 0\n', {
        mode: 0o755,
      });
      writeFileSync(
        join(directory, 'pnpm'),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$JOVIE_CI_CAPTURE"\n',
        { mode: 0o755 }
      );

      const result = spawnSync(
        process.execPath,
        [join(REPO_ROOT, 'scripts/run-affected-tests.mjs'), '--control'],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            JOVIE_CI_CAPTURE: capture,
          },
          encoding: 'utf8',
          timeout: 10_000,
        }
      );
      expect(result.status, result.stderr).toBe(0);
      const scriptCommand = readFileSync(capture, 'utf8')
        .split('\n')
        .find(command => command.startsWith('exec vitest --root scripts '));
      expect(scriptCommand).toBeDefined();
      expect(scriptCommand.split(' ')).toContain(
        'lib/__tests__/ci-fast-lanes.test.mjs'
      );
      expect(scriptCommand).toContain('--coverage');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('runDesignConformance', () => {
  const originalEventName = process.env.GITHUB_EVENT_NAME;

  afterEach(() => {
    process.env.GITHUB_EVENT_NAME = originalEventName;
    vi.clearAllMocks();
  });

  it('skips on eve-pilot-only changed files', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFileList: ['apps/eve-pilot/some-ui-changes.swift'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.output).toContain(
      'Design conformance skipped (no design-domain files changed)'
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs for iOS design-domain files (for example AppShellTabBar.swift)', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFileList: ['apps/ios/Scenes/AppShell/AppShellTabBar.swift'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(LANE_COMMANDS['design-conformance']);
    expect(result.skipped).toBeUndefined();
  });

  it('fails closed when changed files are unavailable', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    const execute = vi.fn().mockReturnValue({
      code: 0,
      output: 'executed',
    });

    const result = runDesignConformance({
      changedFileList: null,
      execute,
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('failed: changed files unavailable');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runStructural screenshot contract discovery', () => {
  const originalEventName = process.env.GITHUB_EVENT_NAME;
  const originalProductLanes = process.env.CI_PRODUCT_LANES;
  const originalSkipStructural = process.env.CI_FAST_SKIP_STRUCTURAL;
  const originalScmBase = process.env.TURBO_SCM_BASE;

  afterEach(() => {
    for (const [name, value] of [
      ['GITHUB_EVENT_NAME', originalEventName],
      ['CI_PRODUCT_LANES', originalProductLanes],
      ['CI_FAST_SKIP_STRUCTURAL', originalSkipStructural],
      ['TURBO_SCM_BASE', originalScmBase],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.clearAllMocks();
  });

  it.each([
    ['web', true],
    ['operations', true],
    ['web,operations', true],
    ['ios', false],
  ])(
    'runs the screenshot contract once for selected lanes %s',
    (lanes, expected) => {
      process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
      process.env.CI_PRODUCT_LANES = lanes;
      process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
      const execute = vi
        .fn()
        .mockReturnValue({ code: 0, output: 'executed\n' });

      const result = runStructural({ execute });
      const screenshotCalls = execute.mock.calls.filter(
        ([command]) => command === SCREENSHOT_CATALOG_COMMAND
      );

      expect(result.code).toBe(0);
      expect(screenshotCalls).toHaveLength(expected ? 1 : 0);
      if (expected) {
        expect(execute.mock.calls[0][0]).toBe(SCREENSHOT_CATALOG_COMMAND);
        expect(execute.mock.calls[1][0]).toBe(
          STRUCTURAL_RUNNER_COVERAGE_COMMAND
        );
      } else {
        expect(result.skipped).toBe(true);
        expect(execute).not.toHaveBeenCalled();
      }
    }
  );

  it('runs on a pull request changing the PR Size Guard workflow', () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'executed\n' });

    const result = runStructural({
      changedFileList: ['.github/workflows/pr-size-guard.yml'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(result.skipped).toBeUndefined();
    expect(execute.mock.calls[0][0]).toBe(SCREENSHOT_CATALOG_COMMAND);
  });

  it('stops before later structural commands when the screenshot contract fails', () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi
      .fn()
      .mockReturnValue({ code: 17, output: 'fixture drift\n' });

    expect(runStructural({ execute })).toMatchObject({
      code: 17,
      output: expect.stringContaining('failed (exit 17).\n\nfixture drift'),
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(SCREENSHOT_CATALOG_COMMAND);
  });

  it('stops when runner coverage falls below its hosted floor', () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi
      .fn()
      .mockReturnValueOnce({ code: 0, output: 'screenshot pass\n' })
      .mockReturnValueOnce({ code: 19, output: 'coverage floor failed\n' });

    expect(runStructural({ execute })).toMatchObject({
      code: 19,
      output: expect.stringContaining(
        'failed (exit 19).\n\ncoverage floor failed'
      ),
    });
    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      SCREENSHOT_CATALOG_COMMAND,
      STRUCTURAL_RUNNER_COVERAGE_COMMAND,
    ]);
  });

  it('uses the default executor on the structural skip path', () => {
    process.env.CI_FAST_SKIP_STRUCTURAL = 'true';

    expect(runStructural()).toMatchObject({ code: 0, skipped: true });
  });

  it('keeps empty checkout diffs fail closed to structural execution', () => {
    process.env.GITHUB_EVENT_NAME = 'push';
    process.env.TURBO_SCM_BASE = 'HEAD';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'executed\n' });

    expect(runStructural({ execute })).toMatchObject({ code: 0 });
    expect(execute.mock.calls[0][0]).toBe(SCREENSHOT_CATALOG_COMMAND);
    expect(execute.mock.calls[1][0]).toBe(STRUCTURAL_RUNNER_COVERAGE_COMMAND);
  });
});

describe('structural failure diagnostics', () => {
  const failureNode =
    'scripts/tests/test_agent_workflow_hygiene.py::test_conflict_handler';
  const noisyFailure = [
    'token-like leading fixture text must not become a diagnostic label',
    'FAILED scripts/not-selected.py::test_fake - private fixture value',
    `FAILED scripts/tests/test_agent_workflow_hygiene.py::test_${'x'.repeat(220)}`,
    `FAILED ${failureNode}[private-parameter] - AssertionError: private-body`,
    `FAILED ${failureNode}[duplicate-parameter] - duplicate`,
    'FAILED scripts/tests/test_agent_workflow_hygiene.py::TestGroup::test_second',
    'FAILED scripts/tests/test_gh_retry.py::test_third',
    'FAILED scripts/tests/test_gh_retry.py::test_fourth',
    'YAML assertion tail\n'.repeat(300),
    '1 failed, 402 passed\n',
  ].join('\n');

  afterEach(() => vi.unstubAllEnvs());

  it('retains bounded registered identities from only the failed command', () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations,web');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn(command => ({
      code: command.includes('python3 -m pytest ') ? 23 : 0,
      output: command.includes('python3 -m pytest ')
        ? noisyFailure
        : `FAILED ${failureNode}_successful_command\n`,
    }));
    const result = runStructural({ execute });
    expect(result.code).toBe(23);
    expect(execute.mock.calls.at(-1)[0]).toContain('python3 -m pytest ');
    expect(
      execute.mock.calls.some(([command]) =>
        command.includes('YoutubeThumbnailsLanding')
      )
    ).toBe(false);
    expect(result.output.length).toBeLessThanOrEqual(1200);
    const header = result.output.split('\n\n')[0];
    expect(header).toMatch(
      /^Structural command \d+\/\d+ failed \(exit 23\)\./u
    );
    expect(header.split('\n').slice(1)).toEqual([
      `FAILED ${failureNode}`,
      'FAILED scripts/tests/test_agent_workflow_hygiene.py::TestGroup::test_second',
      'FAILED scripts/tests/test_gh_retry.py::test_third',
    ]);
    expect(result.output).not.toMatch(
      /private-|test_fake|test_fourth|successful_command|token-like/u
    );
    expect(result.output).toContain('1 failed, 402 passed');
  });

  it('reports command and exit without inventing an identity for unknown output', () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn(() => ({ code: 31, output: 'unknown failure\n' }));
    const result = runStructural({ execute });
    expect(result.code).toBe(31);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.output).toMatch(
      /^Structural command 1\/\d+ failed \(exit 31\)\.\n\nunknown failure$/u
    );
  });

  it.each(['noisy', 'long-header', 'other-lane'])(
    'preserves bounded diagnostics through the real CLI: %s',
    scenario => {
      const directory = mkdtempSync(
        join(tmpdir(), 'jovie-structural-diagnostic-')
      );
      try {
        const fixture = join(directory, 'failure.txt');
        const output = join(directory, 'lanes.json');
        const summary = join(directory, 'summary.md');
        const longNodes = [1, 2, 3].map(
          index =>
            `scripts/tests/test_gh_retry.py::test_${'x'.repeat(150)}_${index}`
        );
        const fixtureText =
          scenario === 'long-header'
            ? `${longNodes.map(node => `FAILED ${node}`).join('\n')}\n`
            : scenario === 'other-lane'
              ? `Structural command untrusted prefix\n\n${'tail-line\n'.repeat(9)}`
              : noisyFailure;
        writeFileSync(fixture, fixtureText);
        for (const name of ['node', 'pnpm', 'bash']) {
          writeFileSync(
            join(directory, name),
            '#!/bin/sh\nprintf "preceding successful command\\n"\nexit 0\n',
            { mode: 0o755 }
          );
        }
        if (scenario === 'other-lane') {
          writeFileSync(
            join(directory, 'pnpm'),
            '#!/bin/sh\ncat "$JOVIE_FAILURE_FIXTURE"\nexit 23\n',
            { mode: 0o755 }
          );
        }
        writeFileSync(
          join(directory, 'python3'),
          `#!/bin/sh
case "$*" in
  *"-m pytest "*) cat "$JOVIE_FAILURE_FIXTURE"; printf 'later unittest stderr passed\\n' >&2; exit 23 ;;
esac
exit 0
`,
          { mode: 0o755 }
        );
        const result = spawnSync(
          process.execPath,
          [join(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
          {
            cwd: REPO_ROOT,
            env: {
              PATH: `${directory}:/usr/bin:/bin`,
              GITHUB_EVENT_NAME: 'workflow_dispatch',
              CI_PRODUCT_LANES: 'operations,web',
              CI_FAST_SKIP_STRUCTURAL: 'false',
              CI_FAST_ONLY_STRUCTURAL:
                scenario === 'other-lane' ? 'false' : 'true',
              CI_FAST_LANE_GROUP:
                scenario === 'other-lane' ? 'typecheck' : 'remaining',
              CI_FAST_LANES_OUT: output,
              GITHUB_STEP_SUMMARY: summary,
              JOVIE_FAILURE_FIXTURE: fixture,
            },
            encoding: 'utf8',
            timeout: 10000,
          }
        );
        expect(result.status, result.stderr).toBe(1);
        const report = JSON.parse(readFileSync(output, 'utf8'));
        expect(report.setupError).toBeNull();
        expect(report.lanes).toHaveLength(1);
        expect(report.lanes[0].status).toBe('failure');
        const diagnostic = report.lanes[0].logExcerpt;
        expect(diagnostic.length).toBeLessThanOrEqual(1200);
        expect(readFileSync(summary, 'utf8')).toContain(diagnostic);
        const annotation = result.stderr
          .split('\n')
          .find(line => line.startsWith('::error::'));
        expect(annotation).toBeDefined();
        expect(annotation.slice('::error::'.length).length).toBeLessThanOrEqual(
          400
        );
        if (scenario === 'other-lane') {
          expect(report.lanes[0].id).toBe('typecheck');
          expect(diagnostic).toContain('Structural command untrusted prefix');
          expect(annotation).toContain('tail-line');
          expect(annotation).not.toContain('Structural command');
        } else {
          expect(diagnostic).toContain('failed (exit 23)');
          expect(diagnostic).toContain('later unittest stderr passed');
          const expectedNode =
            scenario === 'long-header' ? longNodes[0] : failureNode;
          expect(diagnostic).toContain(`FAILED ${expectedNode}`);
          expect(annotation).toContain(`FAILED ${expectedNode}`);
          expect(annotation).not.toMatch(/private-|token-like|YAML assertion/u);
          if (scenario === 'long-header') {
            expect(diagnostic.split('\n\n')[0].split('\n').slice(1)).toEqual(
              longNodes.map(node => `FAILED ${node}`)
            );
            expect(diagnostic.split('\n\n')[0].length).toBeGreaterThan(400);
          }
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
