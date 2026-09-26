import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACQUISITION_CERTIFICATION_COMMAND,
  BIOME_TOOLCHAIN_FILES,
  biomeNeedsFullTree,
  CERTIFICATION_KERNEL_COMMAND,
  escapeAnnotationMessage,
  escapeAnnotationProperty,
  extractDiagnosticLines,
  failureAnnotationMessage,
  formatStructuralTimings,
  LANE_COMMANDS,
  laneFailureExcerpt,
  MARKETING_CERTIFICATION_COMMAND,
  ROUTE_PREP_COVERAGE_COMMAND,
  runCommandPool,
  runDesignConformance,
  runStructural,
  STRUCTURAL_DEFAULT_CONCURRENCY,
  stripGitFetchNoise,
  structuralConcurrency,
  structuralLocks,
  webCiContractTestsCommand,
} from '../../ci-fast-lanes.mjs';
import {
  ALLOWLIST_PATH as LATENCY_ALLOWLIST_PATH,
  RUNTIME_ROOTS as LATENCY_RUNTIME_ROOTS,
} from '../../invariants/latency-sensitive-execution-paths.mjs';
import {
  INVARIANT_SCANNED_PATHS,
  isInvariantScannedPath,
} from '../../invariants/scanned-paths.mjs';
import { classifyProductLanes } from '../product-lane-classifier.mjs';

const WEB_CI_CONTRACT_TESTS_COMMAND = webCiContractTestsCommand(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'apps/web/tests/quarantine.json'
  )
);
const STRUCTURAL_RUNNER_COVERAGE_COMMAND =
  'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/ci-fast-lanes.test.mjs --coverage --coverage.include=ci-fast-lanes.mjs --coverage.reporter=text --coverage.reporter=json --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-ci-fast-structural-coverage" --coverage.thresholds.statements=30 --coverage.thresholds.lines=32 --coverage.thresholds.branches=24 --coverage.thresholds.functions=27';
const SUMMER_BRIDGE_COVERAGE_COMMAND =
  'pnpm --dir apps/web exec vitest run --config vitest.config.fast.mts app/api/internal/ovie/summer-bottleneck/route.test.ts --coverage --coverage.include=app/api/internal/ovie/summer-bottleneck/route.ts --coverage.include=lib/ovie/summer-admissions.ts --coverage.include=lib/ovie/summer-ci-audit.ts';
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

  // These cases pin serial list order; pool ordering is covered separately.
  beforeEach(() => vi.stubEnv('CI_FAST_STRUCTURAL_CONCURRENCY', '1'));

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('never runs a tests/unit/ci file in two structural commands', async () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.CI_PRODUCT_LANES = 'web,operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'ok\n' });
    await runStructural({ execute });
    const commands = execute.mock.calls.map(([command]) => String(command));
    const directoryRuns = commands.filter(command =>
      /vitest\.config\.mts tests\/unit\/ci( |$)/.test(command)
    );
    expect(directoryRuns).toHaveLength(1);
    const explicitCiFiles = commands
      .filter(command => command !== directoryRuns[0])
      .flatMap(
        command => command.match(/tests\/unit\/ci\/[\w.-]+\.test\.ts/g) ?? []
      );
    expect(explicitCiFiles.length).toBeGreaterThan(0);
    // Anything named explicitly elsewhere must be excluded from the directory
    // run, or it executes twice (Sentry on #18344).
    for (const file of explicitCiFiles) {
      expect(directoryRuns[0]).toContain(`--exclude=${file}`);
    }
  });

  it.each([
    ['web', true],
    ['operations', true],
    ['web,operations', true],
    ['ios', false],
  ])(
    'runs the screenshot contract once for selected lanes %s',
    async (lanes, expected) => {
      process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
      process.env.CI_PRODUCT_LANES = lanes;
      process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
      const execute = vi
        .fn()
        .mockReturnValue({ code: 0, output: 'executed\n' });

      const result = await runStructural({ execute });
      const screenshotCalls = execute.mock.calls.filter(
        ([command]) => command === WEB_CI_CONTRACT_TESTS_COMMAND
      );

      expect(result.code).toBe(0);
      expect(screenshotCalls).toHaveLength(expected ? 1 : 0);
      if (expected) {
        expect(execute.mock.calls[0][0]).toBe(WEB_CI_CONTRACT_TESTS_COMMAND);
        expect(execute.mock.calls[1][0]).toBe(
          STRUCTURAL_RUNNER_COVERAGE_COMMAND
        );
      } else {
        expect(result.skipped).toBe(true);
        expect(execute).not.toHaveBeenCalled();
      }
    }
  );

  it.each([
    ['web', 1],
    ['operations', 1],
    ['web,operations', 1],
    ['ios', 0],
  ])(
    'runs the quarantined deploy contract by name once for lanes %s',
    async (lanes, expected) => {
      // #18339 landed a red deploy contract through an operations-only diff:
      // the directory run excludes quarantined files and the by-name run was
      // web-only.
      process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
      process.env.CI_PRODUCT_LANES = lanes;
      process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
      const execute = vi
        .fn()
        .mockReturnValue({ code: 0, output: 'executed\n' });
      await runStructural({ execute });
      const byName = execute.mock.calls.filter(([command]) =>
        String(command).endsWith('tests/unit/ci/deploy-workflow.test.ts')
      );
      expect(byName).toHaveLength(expected);
    }
  );

  it('runs on a pull request changing the PR Size Guard workflow', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'executed\n' });

    const result = await runStructural({
      changedFileList: ['.github/workflows/pr-size-guard.yml'],
      execute,
    });

    expect(result.code).toBe(0);
    expect(result.skipped).toBeUndefined();
    expect(execute.mock.calls[0][0]).toBe(WEB_CI_CONTRACT_TESTS_COMMAND);
  });

  // #18222 changed only pr-size-guard.yml: classified operations-only, the web
  // Unit Tests shards skipped, and main went red on apps/web/tests/unit/ci.
  it.each([
    '.github/workflows/pr-size-guard.yml',
    '.github/workflows/ci.yml',
    '.github/actions/setup-doppler/action.yml',
    '.github/scripts/production-marker-state.mjs',
    'scripts/ci/neon-orphan-reaper.mjs',
    'config/node-runtime-policy.json',
  ])(
    'runs every apps/web/tests/unit/ci contract when only %s changes in a merge group',
    async path => {
      const receipt = classifyProductLanes([path]);
      expect(receipt.selectedLanes).toEqual(['operations']);
      process.env.GITHUB_EVENT_NAME = 'merge_group';
      process.env.CI_PRODUCT_LANES = receipt.selectedLanes.join(',');
      process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
      const execute = vi
        .fn()
        .mockReturnValue({ code: 0, output: 'executed\n' });

      const result = await runStructural({ changedFileList: [path], execute });

      expect(result.code).toBe(0);
      expect(result.skipped).toBeUndefined();
      expect(execute.mock.calls[0][0]).toBe(WEB_CI_CONTRACT_TESTS_COMMAND);
    }
  );

  it('stops before later structural commands when the screenshot contract fails', async () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi
      .fn()
      .mockReturnValue({ code: 17, output: 'fixture drift\n' });

    expect(await runStructural({ execute })).toMatchObject({
      code: 17,
      output: expect.stringMatching(
        /failed \(exit 17\)\. Command: [^\n]+\n\nfixture drift/u
      ),
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      WEB_CI_CONTRACT_TESTS_COMMAND
    );
  });

  it('stops when runner coverage falls below its hosted floor', async () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi
      .fn()
      .mockReturnValueOnce({ code: 0, output: 'screenshot pass\n' })
      .mockReturnValueOnce({ code: 19, output: 'coverage floor failed\n' });

    expect(await runStructural({ execute })).toMatchObject({
      code: 19,
      output: expect.stringMatching(
        /failed \(exit 19\)\. Command: [^\n]+\ncoverage floor failed\n\ncoverage floor failed$/u
      ),
    });
    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      WEB_CI_CONTRACT_TESTS_COMMAND,
      STRUCTURAL_RUNNER_COVERAGE_COMMAND,
    ]);
  });

  it('runs route-prep behavior coverage for the operations structural lane', async () => {
    process.env.GITHUB_EVENT_NAME = 'merge_group';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'executed\n' });

    expect((await runStructural({ execute })).code).toBe(0);
    expect(
      execute.mock.calls.some(
        ([command]) => command === ROUTE_PREP_COVERAGE_COMMAND
      )
    ).toBe(true);
  });

  it('uses the default executor on the structural skip path', async () => {
    process.env.CI_FAST_SKIP_STRUCTURAL = 'true';

    expect(await runStructural()).toMatchObject({ code: 0, skipped: true });
  });

  it('keeps empty checkout diffs fail closed to structural execution', async () => {
    process.env.GITHUB_EVENT_NAME = 'push';
    process.env.TURBO_SCM_BASE = 'HEAD';
    process.env.CI_PRODUCT_LANES = 'operations';
    process.env.CI_FAST_SKIP_STRUCTURAL = 'false';
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'executed\n' });

    expect(await runStructural({ execute })).toMatchObject({ code: 0 });
    expect(execute.mock.calls[0][0]).toBe(WEB_CI_CONTRACT_TESTS_COMMAND);
    expect(execute.mock.calls[1][0]).toBe(STRUCTURAL_RUNNER_COVERAGE_COMMAND);
  });
});

describe('Summer bridge structural coverage selection', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['web', 'apps/web/app/api/internal/ovie/summer-bottleneck/route.ts'],
    ['web', 'apps/web/app/api/internal/ovie/summer-bottleneck/route.test.ts'],
    ['operations', 'scripts/symphony/summer_bottleneck_producer.py'],
    [
      'web,operations',
      'apps/web/app/api/internal/ovie/summer-bottleneck/route.test.ts',
    ],
  ])(
    'enforces coverage once for %s changes to %s',
    async (lanes, changedFile) => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
      vi.stubEnv('CI_PRODUCT_LANES', lanes);
      vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
      const execute = vi.fn((_command = '') => ({
        code: 0,
        output: 'passed\n',
      }));

      const result = await runStructural({
        changedFileList: [changedFile],
        execute,
      });

      expect(result.code).toBe(0);
      expect(
        execute.mock.calls.filter(
          ([command]) => command === SUMMER_BRIDGE_COVERAGE_COMMAND
        )
      ).toHaveLength(1);
    }
  );

  it('stops the web lane when the route coverage floor fails', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
    vi.stubEnv('CI_PRODUCT_LANES', 'web');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn(command =>
      command === SUMMER_BRIDGE_COVERAGE_COMMAND
        ? { code: 17, output: 'route coverage floor failed\n' }
        : { code: 0, output: 'passed\n' }
    );

    expect(
      await runStructural({
        changedFileList: [
          'apps/web/app/api/internal/ovie/summer-bottleneck/route.test.ts',
        ],
        execute,
      })
    ).toMatchObject({
      code: 17,
      output: expect.stringContaining('route coverage floor failed'),
    });
    expect(execute.mock.calls.at(-1)[0]).toBe(SUMMER_BRIDGE_COVERAGE_COMMAND);
  });
});

// #18182 added a second readFileSync to apps/desktop/src/main.ts. It classified
// as mac,web, the structural lane ran without the operations-only
// invariants:check, the merge group passed, and main went red on JOV-INV-031.
describe('invariant-scanned structural selection', () => {
  afterEach(() => vi.unstubAllEnvs());

  const INVARIANTS = 'pnpm invariants:check';
  const invariantRuns = execute =>
    execute.mock.calls.filter(([command]) => command === INVARIANTS).length;
  const runFor = async (event, files, lanes) => {
    vi.stubEnv('GITHUB_EVENT_NAME', event);
    vi.stubEnv('CI_PRODUCT_LANES', lanes.join(','));
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn().mockReturnValue({ code: 0, output: 'ok\n' });
    const result = await runStructural({ changedFileList: files, execute });
    return { execute, result };
  };

  it.each([
    ['pull_request', 'apps/desktop/src/main.ts'],
    ['merge_group', 'apps/desktop/src/main.ts'],
    ['pull_request', 'apps/web/lib/chat/knowledge/topics.ts'],
    ['merge_group', 'apps/web/lib/chat/knowledge/topics.ts'],
  ])(
    'runs invariants:check on %s when only %s changes',
    async (event, path) => {
      const lanes = classifyProductLanes([path]).selectedLanes;
      expect(lanes).not.toContain('operations');
      const { execute, result } = await runFor(event, [path], lanes);
      expect(result.code).toBe(0);
      expect(result.skipped).toBeUndefined();
      expect(invariantRuns(execute)).toBe(1);
    }
  );

  it('fails the lane when the invariant ratchet fails on a mac-only change', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'merge_group');
    vi.stubEnv('CI_PRODUCT_LANES', 'mac');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn(command =>
      command === INVARIANTS
        ? { code: 1, output: 'readFileSync count 2 exceeds allowlist 1\n' }
        : { code: 0, output: 'ok\n' }
    );
    expect(
      await runStructural({
        changedFileList: ['apps/desktop/src/main.ts'],
        execute,
      })
    ).toMatchObject({
      code: 1,
      output: expect.stringContaining('exceeds allowlist 1'),
    });
  });

  it('runs invariants:check once when operations already carries it', async () => {
    const { execute } = await runFor(
      'merge_group',
      ['apps/desktop/src/main.ts', 'scripts/invariants/validate.mjs'],
      ['mac', 'operations']
    );
    expect(invariantRuns(execute)).toBe(1);
  });

  it('keeps invariants:check off web changes outside every scanned path', async () => {
    const path = 'apps/web/tests/e2e/public-profile-smoke.spec.ts';
    expect(isInvariantScannedPath(path)).toBe(false);
    const { execute } = await runFor(
      'pull_request',
      [path],
      classifyProductLanes([path]).selectedLanes
    );
    expect(invariantRuns(execute)).toBe(0);
  });

  it('covers every latency root and allowlisted file', () => {
    const allowlist = JSON.parse(
      readFileSync(join(REPO_ROOT, LATENCY_ALLOWLIST_PATH), 'utf8')
    );
    for (const path of [
      ...Object.keys(allowlist.entries),
      ...LATENCY_RUNTIME_ROOTS,
      LATENCY_ALLOWLIST_PATH,
    ]) {
      expect(isInvariantScannedPath(path), path).toBe(true);
    }
  });

  it('classifies every scanned path into a lane that reaches structural', () => {
    for (const root of INVARIANT_SCANNED_PATHS) {
      const file = /\.[a-z]+$/u.test(root) ? root : `${root}/index.ts`;
      const lanes = classifyProductLanes([file]).selectedLanes;
      expect(
        lanes.some(lane => ['operations', 'web', 'mac'].includes(lane)),
        `${file} -> ${lanes.join(',')}`
      ).toBe(true);
    }
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

  // Serial list order keeps "command 1/N" deterministic for these cases.
  beforeEach(() => vi.stubEnv('CI_FAST_STRUCTURAL_CONCURRENCY', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it('retains bounded registered identities from only the failed command', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations,web');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn(command => ({
      code: command.includes('python3 -m pytest ') ? 23 : 0,
      output: command.includes('python3 -m pytest ')
        ? noisyFailure
        : `FAILED ${failureNode}_successful_command\n`,
    }));
    const result = await runStructural({ execute });
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

  it('reports command and exit without inventing an identity for unknown output', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const execute = vi.fn((/** @type {string} */ _command) => ({
      code: 31,
      output: 'unknown failure\n',
    }));
    const result = await runStructural({ execute });
    expect(result.code).toBe(31);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.output).toMatch(
      /^Structural command 1\/\d+ failed \(exit 31\)\. Command: \S[^\n]*\n\nunknown failure$/u
    );
    const label = result.output.split('\n')[0].split(' Command: ')[1];
    expect(label.length).toBeLessThanOrEqual(80);
    const firstCommand = execute.mock.calls[0]?.[0] ?? '';
    expect(firstCommand.replace(/\s+/gu, ' ')).toContain(
      label.replace(/…$/u, '')
    );
  });

  it('surfaces the coverage ERROR line and drops git fetch noise when no identity exists', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const coverageError =
      'ERROR: Coverage for lines (99.13%) does not meet "app/api/internal/ovie/summer-bottleneck/route.ts" threshold (100%)';
    const output = [
      ' * [new branch]            feature/a -> origin/feature/a',
      '   1a2b3c4..5d6e7f8  main       -> origin/main',
      coverageError,
      ...Array.from(
        { length: 4000 },
        (_, index) =>
          ` * [new branch]      noise-${index} -> origin/noise-${index}`
      ),
    ].join('\n');
    const execute = vi.fn(() => ({ code: 1, output }));
    const result = await runStructural({ execute });
    expect(result.code).toBe(1);
    const [header, body] = result.output.split('\n\n');
    expect(header.split('\n')).toEqual([
      expect.stringMatching(
        /^Structural command 1\/\d+ failed \(exit 1\)\. Command: /u
      ),
      coverageError,
    ]);
    expect(result.output).not.toContain('[new branch]');
    expect(result.output).not.toContain('1a2b3c4..5d6e7f8');
    expect(body).toBe(coverageError);
    expect(result.output.length).toBeLessThanOrEqual(1200);
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
        // The typecheck group also runs the web tests ratchet after typecheck.
        expect(report.lanes).toHaveLength(scenario === 'other-lane' ? 2 : 1);
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

/** Executor whose commands finish only when the test settles them. */
function deferredExecutor() {
  const calls = [];
  const execute = vi.fn(
    command =>
      new Promise(resolveCall => {
        calls.push({ command, settle: resolveCall });
      })
  );
  const settle = (command, code = 0, output = `${command}\n`) =>
    calls.find(call => call.command === command).settle({ code, output });
  return { calls, execute, settle };
}

const flush = () => new Promise(resolveFlush => setImmediate(resolveFlush));

describe('structural command pool', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('caps in-flight commands at the configured concurrency', async () => {
    const { calls, execute, settle } = deferredExecutor();
    const commands = Array.from({ length: 8 }, (_, index) => `c${index}`);
    const done = runCommandPool(commands, { execute, concurrency: 3 });
    let maxInFlight = 0;
    for (const [settled, command] of commands.entries()) {
      await flush();
      maxInFlight = Math.max(maxInFlight, calls.length - settled);
      expect(calls.length - settled).toBeLessThanOrEqual(3);
      settle(command);
    }
    const results = await done;
    expect(maxInFlight).toBe(3);
    expect(execute.mock.calls.map(([command]) => command)).toEqual(commands);
    expect(results.every(result => result.code === 0)).toBe(true);
  });

  it('never overlaps commands that share a lock and keeps their list order', async () => {
    const { calls, execute, settle } = deferredExecutor();
    const done = runCommandPool(['a1', 'b1', 'a2', 'c1', 'a3'], {
      execute,
      concurrency: 3,
      locks: [['a'], ['b'], ['a'], [], ['a']],
    });
    await flush();
    expect(calls.map(call => call.command)).toEqual(['a1', 'b1', 'c1']);
    settle('b1');
    await flush();
    // A free slot must not admit a2 while a1 still holds lock "a".
    expect(calls.map(call => call.command)).toEqual(['a1', 'b1', 'c1']);
    settle('a1');
    await flush();
    expect(calls.map(call => call.command)).toContain('a2');
    expect(calls.map(call => call.command)).not.toContain('a3');
    settle('a2');
    await flush();
    settle('c1');
    settle('a3');
    expect((await done).map(result => result.code)).toEqual([0, 0, 0, 0, 0]);
    expect(
      calls.map(call => call.command).filter(c => c.startsWith('a'))
    ).toEqual(['a1', 'a2', 'a3']);
  });

  it('starts long poles first without jumping an earlier same-lock command', async () => {
    const started = [];
    const results = await runCommandPool(
      ['a', 'x1', 'pole', 'x2', 'lockedPole'],
      {
        concurrency: 1,
        locks: [['L'], [], [], [], ['L']],
        first: [2, 4],
        execute: command => {
          started.push(command);
          return { code: 0, output: `${command}\n` };
        },
      }
    );
    // lockedPole waits for the earlier "a" that shares lock L.
    expect(started).toEqual(['pole', 'a', 'lockedPole', 'x1', 'x2']);
    expect(results.map(result => result.output)).toEqual([
      'a\n',
      'x1\n',
      'pole\n',
      'x2\n',
      'lockedPole\n',
    ]);
  });

  it('starts long-pole structural commands ahead of list order only when parallel', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const startOrder = async concurrency => {
      const started = [];
      await runStructural({
        concurrency,
        execute: command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      });
      return started;
    };
    const parallel = await startOrder(3);
    const head = parallel.slice(0, 3).join('\n');
    expect(head).toContain('pnpm invariants:check');
    expect(head).toContain('run-governor-bounded-codex-selector.sh');
    expect(head).toContain('python3 -m pytest ');
    // Both complementary pytest shards are long poles.
    expect(
      parallel
        .slice(0, 4)
        .filter(command => command.includes('python3 -m pytest '))
    ).toHaveLength(2);
    const serial = await startOrder(1);
    expect(serial[0]).toBe(WEB_CI_CONTRACT_TESTS_COMMAND);
    expect([...serial].sort()).toEqual([...parallel].sort());
  });

  it('starts nothing new after a failure but lets in-flight commands finish', async () => {
    const { calls, execute, settle } = deferredExecutor();
    const done = runCommandPool(['c0', 'c1', 'c2', 'c3'], {
      execute,
      concurrency: 2,
    });
    await flush();
    settle('c0', 9, 'boom\n');
    await flush();
    expect(calls.map(call => call.command)).toEqual(['c0', 'c1']);
    settle('c1', 0, 'late pass\n');
    const results = await done;
    expect(execute).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ code: 9, output: 'boom\n' });
    expect(results[1]).toMatchObject({ code: 0, output: 'late pass\n' });
    expect(results.slice(2)).toEqual([undefined, undefined]);
  });

  it('turns thrown and rejected executions into failures', async () => {
    const execute = command => {
      if (command === 'throw') throw new Error('sync explode');
      return Promise.reject('async explode');
    };
    const [thrown, never] = await runCommandPool(['throw', 'reject'], {
      concurrency: 2,
      execute,
    });
    expect(thrown.code).toBe(1);
    expect(thrown.output).toContain('sync explode');
    // A synchronous failure is known before the next slot is filled.
    expect(never).toBeUndefined();
    const [rejected] = await runCommandPool(['reject'], {
      concurrency: 2,
      execute,
    });
    expect(rejected).toMatchObject({ code: 1, output: 'async explode' });
  });

  it('emits combined output in list order and reports the first failure by list order', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    // A synchronous executor runs serially, so it records the list order.
    const order = [];
    await runStructural({
      concurrency: 1,
      execute: command => {
        order.push(command);
        return { code: 0, output: '' };
      },
    });
    // Later commands finish first; output must not follow completion order.
    const delayed = failing => command => {
      const index = order.indexOf(command);
      return new Promise(resolveCall =>
        setTimeout(
          () =>
            resolveCall({
              code: failing.includes(index) ? 40 + index : 0,
              output: `out-${index}\n`,
            }),
          Math.max(0, 4 - index) * 5
        )
      );
    };

    const pass = await runStructural({ execute: delayed([]), concurrency: 3 });
    expect(pass.code).toBe(0);
    expect(pass.output).toBe(
      order.map((_, index) => `out-${index}\n`).join('')
    );
    expect(pass.timings).toHaveLength(order.length);

    // Command 3 (index 2) fails first in time; command 2 (index 1) fails later.
    const fail = await runStructural({
      execute: delayed([1, 2]),
      concurrency: 3,
    });
    expect(fail.code).toBe(41);
    expect(fail.output).toMatch(
      /^Structural command 2\/\d+ failed \(exit 41\)\. Command: pnpm exec vitest --root scripts/u
    );
    expect(fail.output).toContain('out-1');
    expect(fail.output).not.toContain('out-2');
  });

  it('never runs real structural commands that share writable state together', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'web,operations,mac');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    const active = new Map();
    const started = [];
    let maxActive = 0;
    const execute = command =>
      new Promise(resolveCall => {
        const locks = structuralLocks(command);
        for (const other of active.values()) {
          expect(other.filter(lock => locks.includes(lock))).toEqual([]);
        }
        active.set(command, locks);
        started.push(command);
        maxActive = Math.max(maxActive, active.size);
        setTimeout(() => {
          active.delete(command);
          resolveCall({ code: 0, output: '' });
        }, 1);
      });
    const result = await runStructural({ execute });
    expect(result.code).toBe(0);
    expect(maxActive).toBe(STRUCTURAL_DEFAULT_CONCURRENCY);
    const webCoverage = started.filter(command =>
      structuralLocks(command).includes('coverage:apps/web')
    );
    expect(webCoverage).toEqual(
      expect.arrayContaining([
        MARKETING_CERTIFICATION_COMMAND,
        CERTIFICATION_KERNEL_COMMAND,
        ACQUISITION_CERTIFICATION_COMMAND,
      ])
    );
    expect(webCoverage.indexOf(MARKETING_CERTIFICATION_COMMAND)).toBeLessThan(
      webCoverage.indexOf(ACQUISITION_CERTIFICATION_COMMAND)
    );
  });

  it('derives locks for coverage dirs, package aliases, coverage.py, and pytest', () => {
    // Relative reportsDirectory nests inside the cleaned default directory.
    expect(structuralLocks(ACQUISITION_CERTIFICATION_COMMAND)).toEqual([
      'coverage:apps/web',
    ]);
    expect(
      structuralLocks(
        'pnpm exec vitest --root scripts run a.test.mjs --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/x"'
      )
    ).toEqual(['coverage:${RUNNER_TEMP:-/tmp}/x']);
    expect(
      structuralLocks(
        'pnpm exec vitest --root scripts run a.test.mjs --coverage'
      )
    ).toEqual(['coverage:scripts']);
    // Package aliases expand; control tests hide default scripts coverage.
    expect(structuralLocks('pnpm ci:control:test')).toContain(
      'coverage:scripts'
    );
    expect(structuralLocks('pnpm --filter=@jovie/web run lint:seo')).toEqual(
      []
    );
    expect(
      structuralLocks(
        'COVERAGE_FILE="/t/a.coverage" python3 -m coverage run x.py && python3 -m pytest y.py'
      )
    ).toEqual(['pycoverage:/t/a.coverage', 'pytest-cache']);
    // coverage.py driving pytest still writes the shared cache.
    expect(
      structuralLocks(
        'COVERAGE_FILE="/t/l.coverage" python3 -m coverage run --branch -m pytest z.py -q'
      )
    ).toEqual(['pycoverage:/t/l.coverage', 'pytest-cache']);
    // A cache-less pytest invocation holds no shared pytest state.
    expect(
      structuralLocks('python3 -m pytest -p no:cacheprovider -k "a" y.py')
    ).toEqual([]);
    expect(structuralLocks('node --test a.test.mjs')).toEqual([]);
    expect(structuralLocks('pnpm no-such-script-alias')).toEqual([]);
  });

  it('parses the concurrency override and falls back to the default', () => {
    expect(structuralConcurrency(undefined)).toBe(3);
    expect(structuralConcurrency('5')).toBe(5);
    expect(structuralConcurrency(' 1 ')).toBe(1);
    for (const invalid of ['0', '-2', '2.5', 'many', '']) {
      expect(structuralConcurrency(invalid)).toBe(
        STRUCTURAL_DEFAULT_CONCURRENCY
      );
    }
  });

  it('formats a slowest-first timing table with escaped commands', () => {
    const table = formatStructuralTimings(
      [
        { index: 0, command: 'fast | cmd', code: 0, durationMs: 1000 },
        { index: 1, command: 'slow `cmd`', code: 3, durationMs: 9000 },
      ],
      9500
    );
    const rows = table.split('\n').filter(line => line.startsWith('| '));
    expect(table).toContain('wall 9.5s, sum 10.0s, 2 commands');
    expect(rows[2]).toBe("| 2 | 9.0s | exit 3 | `slow 'cmd'` |");
    expect(rows[3]).toBe('| 1 | 1.0s | pass | `fast \\| cmd` |');
    expect(formatStructuralTimings(undefined)).toBe('');
  });
});

describe('biomeNeedsFullTree', () => {
  it('lints the whole tree when Biome config or version can change', () => {
    for (const file of BIOME_TOOLCHAIN_FILES) {
      expect(biomeNeedsFullTree(['apps/web/a.ts', file])).toBe(true);
    }
  });

  it('keeps ordinary PRs on changed-files lint', () => {
    expect(biomeNeedsFullTree([])).toBe(false);
    expect(
      biomeNeedsFullTree(['apps/web/package.json', 'apps/web/lib/utils.ts'])
    ).toBe(false);
  });
});

describe('webCiContractTestsCommand', () => {
  it('honors the quarantine ledger and keeps browser-heavy receipts out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-contract-ledger-'));
    const ledger = join(dir, 'quarantine.json');
    try {
      writeFileSync(
        ledger,
        JSON.stringify({
          entries: [
            { kind: 'unit', path: 'tests/unit/ci/deploy-workflow.test.ts' },
            { kind: 'unit', path: 'tests/unit/inbox/webhook-handler.test.ts' },
            { kind: 'e2e', path: 'tests/unit/ci/not-a-unit.spec.ts' },
          ],
        })
      );
      const command = webCiContractTestsCommand(ledger);
      expect(command).toContain(
        '--exclude=tests/unit/ci/deploy-workflow.test.ts'
      );
      expect(command).toContain(
        '--exclude=tests/unit/ci/playwright-artifact-secrets.test.ts'
      );
      expect(command).not.toContain('webhook-handler');
      expect(command).not.toContain('not-a-unit');
      expect(webCiContractTestsCommand(join(dir, 'missing.json'))).toBe(
        'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci --exclude=tests/unit/ci/playwright-artifact-secrets.test.ts --exclude=tests/unit/ci/production-marker-state.test.ts'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps files run elsewhere excluded when the ledger is unreadable', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const command = webCiContractTestsCommand(
        join(tmpdir(), 'ci-contract-ledger-does-not-exist.json'),
        ['tests/unit/ci/deploy-workflow.test.ts']
      );
      expect(command).toContain(
        '--exclude=tests/unit/ci/deploy-workflow.test.ts'
      );
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining('::warning::Quarantine ledger')
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it('excludes the live ledger deploy-workflow quarantine', () => {
    expect(WEB_CI_CONTRACT_TESTS_COMMAND).toContain(
      '--exclude=tests/unit/ci/deploy-workflow.test.ts'
    );
  });
});

describe('failure annotation helpers', () => {
  it('strips git fetch ref-update noise but keeps real lines', () => {
    expect(
      stripGitFetchNoise(
        [
          ' * [new branch]      a -> origin/a',
          ' * [new tag]         v1 -> v1',
          '   0abc..1def  main -> origin/main',
          'real line',
        ].join('\n')
      )
    ).toBe('real line');
  });

  it('keeps the last bounded, de-duplicated diagnostic lines without ANSI codes', () => {
    const esc = String.fromCharCode(27);
    const text = [
      'Error: first',
      'ok line',
      `${esc}[31m FAIL ${esc}[39m tests/a.test.ts > case`,
      'TypeError: boom',
      'AssertionError: expected 1 to be 2',
      'TypeError: boom',
      `ERROR: ${'x'.repeat(300)}`,
      '1 failed, 3 passed',
      'failure without keyword match',
    ].join('\n');
    const lines = extractDiagnosticLines(text);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('FAIL  tests/a.test.ts > case');
    expect(lines).toContain('TypeError: boom');
    expect(lines).toContain('AssertionError: expected 1 to be 2');
    expect(lines.at(-1)).toBe('1 failed, 3 passed');
    expect(lines.every(line => line.length <= 200)).toBe(true);
    expect(lines).not.toContain('Error: first');
    expect(extractDiagnosticLines('all good\n')).toEqual([]);
    expect(extractDiagnosticLines(undefined)).toEqual([]);
  });

  it('escapes workflow-command messages and properties', () => {
    expect(escapeAnnotationMessage('99.13% a\r\nb')).toBe('99.13%25 a%0D%0Ab');
    expect(escapeAnnotationProperty('Lane: a, b')).toBe('Lane%3A a%2C b');
  });

  it('puts diagnostics first in a non-structural lane excerpt and annotation', () => {
    const output = [
      ' * [new branch]  x -> origin/x',
      'Error: Coverage 99.5% below 100%',
      ...Array.from({ length: 50 }, (_, index) => `tail ${index}`),
    ].join('\n');
    const excerpt = laneFailureExcerpt('typecheck', output);
    expect(excerpt.startsWith('Diagnostics:\nError: Coverage 99.5%')).toBe(
      true
    );
    expect(excerpt).not.toContain('[new branch]');
    expect(excerpt.length).toBeLessThanOrEqual(1200);
    const annotation = failureAnnotationMessage({ id: 'typecheck' }, excerpt);
    expect(annotation).toBe(
      'Diagnostics: | Error: Coverage 99.5%25 below 100%25'
    );
    expect(annotation).not.toMatch(/[\r\n]/u);
  });

  it('falls back to the output tail when no diagnostic line exists', () => {
    const output = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    expect(laneFailureExcerpt('typecheck', output)).toBe(output);
    expect(failureAnnotationMessage({ id: 'typecheck' }, output)).toBe(
      Array.from({ length: 8 }, (_, i) => `line ${i + 4}`).join(' | ')
    );
    expect(failureAnnotationMessage({ id: 'typecheck' }, '')).toBe('');
  });

  it('keeps the newest diagnostics when the annotation header exceeds its budget', () => {
    const early = Array.from(
      { length: 4 },
      (_, index) => `Error: early ${index} ${'x'.repeat(150)}`
    );
    const output = [...early, 'Error: final root cause'].join('\n');
    const annotation = failureAnnotationMessage(
      { id: 'typecheck' },
      laneFailureExcerpt('typecheck', output)
    );
    expect(annotation.startsWith('Diagnostics: | ')).toBe(true);
    expect(annotation.endsWith('Error: final root cause')).toBe(true);
    expect(annotation).not.toContain('early 0');
    expect(annotation.length).toBeLessThanOrEqual(400);
  });

  it('keeps the last occurrence of a repeated diagnostic line', () => {
    const text = [
      'Error: root cause',
      'Error: b',
      'Error: c',
      'Error: d',
      'Error: e',
      'Error: f',
      'Error: root cause',
    ].join('\n');
    expect(extractDiagnosticLines(text)).toEqual([
      'Error: c',
      'Error: d',
      'Error: e',
      'Error: f',
      'Error: root cause',
    ]);
  });

  it('matches lowercase TypeScript compiler errors but not error-count summaries', () => {
    const text = [
      "src/a.ts(1,2): error TS2532: Object is possibly 'undefined'.",
      'errors: 0',
      'Found 0 errors.',
    ].join('\n');
    expect(extractDiagnosticLines(text)).toEqual([
      "src/a.ts(1,2): error TS2532: Object is possibly 'undefined'.",
    ]);
  });

  it('keeps the structural header as the annotation for structural failures', () => {
    const excerpt = laneFailureExcerpt(
      'structural',
      'Structural command 2/9 failed (exit 1). Command: pnpm x\nERROR: 50%\n\ntail'
    );
    expect(failureAnnotationMessage({ id: 'structural' }, excerpt)).toBe(
      'Structural command 2/9 failed (exit 1). Command: pnpm x | ERROR: 50%25'
    );
  });
});
