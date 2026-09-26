import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ACQUISITION_CERTIFICATION_COMMAND,
  affectsWebTestTypecheck,
  BILLING_COVERAGE_COMMAND,
  BILLING_PROVENANCE_COVERAGE_COMMAND,
  BILLING_PROVENANCE_COVERAGE_PATHS,
  CERTIFICATION_KERNEL_COMMAND,
  COPY_GATE_COMMAND,
  changedFiles,
  DESKTOP_RELEASE_COVERAGE_COMMAND,
  FAN_SEND_SAFETY_COVERAGE_COMMAND,
  LANE_COMMANDS,
  LANE_GROUPS,
  listAllChangedFiles,
  MARKETING_CERTIFICATION_COMMAND,
  OFFLINE_FAILURE_COVERAGE_COMMAND,
  STRUCTURAL_PYTEST_FILES,
  STRUCTURAL_PYTEST_SHARD_COMMANDS,
  STRUCTURAL_PYTEST_SHARD_EXPRESSION,
  STRUCTURAL_PYTHON_REGRESSION_COMMANDS,
  selectBillingCoverageCommands,
  selectLanes,
  structuralLocks,
  validateLaneGroups,
} from '../../ci-fast-lanes.mjs';
import { buildControlTestCommands } from '../../run-affected-tests.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);
const CI_FAST_SOURCE = readFileSync(
  resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs'),
  'utf8'
);
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
);

const HOSTED_GROUP_JOBS = [
  { jobId: 'ci-fast-typecheck', nextJobId: 'ci-fast-remaining' },
  {
    jobId: 'ci-fast-remaining',
    nextJobId: 'ci-profile-admission-browser',
  },
];

function jobBlock(jobId, nextJobId) {
  const start = WORKFLOW.indexOf(`  ${jobId}:`);
  expect(start, `missing workflow job ${jobId}`).toBeGreaterThanOrEqual(0);
  const end = nextJobId
    ? WORKFLOW.indexOf(`\n  ${nextJobId}:`, start)
    : WORKFLOW.length;
  if (nextJobId) {
    expect(end, `missing workflow job boundary ${nextJobId}`).toBeGreaterThan(
      start
    );
  }
  return WORKFLOW.slice(start, end);
}

describe('ci-fast bounded parallel workflow', () => {
  it.each(
    STRUCTURAL_PYTHON_REGRESSION_COMMANDS.flatMap((command, index) =>
      [
        { ci: 'true', available: false, suiteExit: 0, expected: 1 },
        { ci: '', available: false, suiteExit: 0, expected: 0 },
        { ci: 'true', available: true, suiteExit: 0, expected: 0 },
        { ci: 'true', available: true, suiteExit: 37, expected: 37 },
      ].map(scenario => ({ ...scenario, index, command }))
    )
  )('executes structural Python dependency policy %j', scenario => {
    const { command } = scenario;
    const root = mkdtempSync(join(tmpdir(), 'structural-python-policy-'));
    const calls = join(root, 'calls');
    try {
      const shim = join(root, 'python3');
      writeFileSync(
        shim,
        [
          '#!/bin/sh',
          'printf "%s\\n" "$*" >> "$POLICY_CALLS"',
          'if [ "$1" = "-c" ]; then exit "$POLICY_IMPORT_EXIT"; fi',
          'if [ "$1" = "-m" ] && [ "$2" = "pytest" ]; then exit "$POLICY_SUITE_EXIT"; fi',
          'exit 0',
          '',
        ].join('\n')
      );
      chmodSync(shim, 0o755);
      const result = spawnSync('/bin/sh', ['-c', command], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: scenario.ci,
          PATH: `${root}:${process.env.PATH}`,
          POLICY_CALLS: calls,
          POLICY_IMPORT_EXIT: scenario.available ? '0' : '1',
          POLICY_SUITE_EXIT: String(scenario.suiteExit),
          RUNNER_TEMP: tmpdir(),
        },
      });
      const invoked = readFileSync(calls, 'utf8');
      const pytestInvocation = invoked
        .split('\n')
        .find(call => call.startsWith('-m pytest '));
      if (scenario.index === 0) {
        // The coverage-gated command has no bare `-m pytest` step, so the
        // stubbed suite exit never applies to it.
        expect(result.status, result.stderr).toBe(
          scenario.expected === 37 ? 0 : scenario.expected
        );
      } else {
        expect(result.status, result.stderr).toBe(scenario.expected);
      }
      if (scenario.available && scenario.index === 0) {
        expect(invoked).toContain('-m coverage run --branch');
        expect(pytestInvocation).toBeUndefined();
      } else if (scenario.available) {
        const shard = scenario.index === 1 ? 'a' : 'b';
        const expression =
          scenario.index === 1
            ? STRUCTURAL_PYTEST_SHARD_EXPRESSION
            : `not (${STRUCTURAL_PYTEST_SHARD_EXPRESSION})`;
        expect(pytestInvocation).toBe(
          [
            '-m pytest -n 2 --durations=20 -v -p no:cacheprovider',
            `--basetemp=${tmpdir()}/jovie-structural-pytest-${shard}`,
            `-k ${expression}`,
            ...STRUCTURAL_PYTEST_FILES,
          ].join(' ')
        );
      } else {
        expect(invoked.trim()).toBe('-c import coverage, pytest, xdist');
        if (scenario.ci === 'true') {
          expect(result.stderr).toContain(
            '::error::pytest/coverage/xdist missing'
          );
        } else {
          expect(result.stdout).toContain('skip local structural regressions');
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('installs the pytest-xdist the structural suite parallelizes with from hashed pins', () => {
    const requirementsIn = readFileSync(
      join(REPO_ROOT, '.github/requirements/pytest.in'),
      'utf8'
    );
    const requirementsTxt = readFileSync(
      join(REPO_ROOT, '.github/requirements/pytest.txt'),
      'utf8'
    );
    const version = /^pytest-xdist==(\S+)$/mu.exec(requirementsIn)?.[1];
    expect(version).toBeTruthy();
    // xdist and its execnet dependency must be hash-pinned: the structural
    // step installs with --require-hashes and `-n 2` fails without xdist.
    for (const pkg of [`pytest-xdist==${version}`, 'execnet==']) {
      const start = requirementsTxt.indexOf(`\n${pkg}`);
      expect(start, `${pkg} missing from pytest.txt`).toBeGreaterThan(-1);
      expect(requirementsTxt.slice(start + 1).split('\n')[1]).toMatch(
        /^\s+--hash=sha256:[0-9a-f]{64}/u
      );
    }
    expect(
      jobBlock('ci-fast-remaining', 'ci-profile-admission-browser')
    ).toContain(
      'python -m pip install --quiet --require-hashes -r .github/requirements/pytest.txt'
    );
  });

  it('partitions the structural pytest suite into exactly complementary shards', () => {
    // The original single invocation ran these files once; the shards must
    // select the identical files with complementary -k expressions so every
    // collected test runs in exactly one shard (never zero, never twice).
    expect(STRUCTURAL_PYTEST_FILES).toEqual([
      'scripts/tests/test_gh_retry.py',
      'scripts/tests/test_vercel_prebuilt_deploy.py',
      'scripts/tests/test_brand_scrub.py',
      'scripts/tests/test_agent_workflow_hygiene.py',
      'scripts/tests/test_runner_routing.py',
      'scripts/tests/test_symphony_ui_pilot_runtime.py',
      'scripts/tests/test_symphony_reconciler_runtime.py',
    ]);
    const shards = STRUCTURAL_PYTEST_SHARD_COMMANDS.map(command => {
      const [, keyword, files] = /-k "([^"]+)" (.+)$/u.exec(command) ?? [];
      return { command, keyword, files: files?.split(' ') };
    });
    expect(shards).toHaveLength(2);
    expect(shards[0].keyword).toBe(STRUCTURAL_PYTEST_SHARD_EXPRESSION);
    expect(shards[1].keyword).toBe(
      `not (${STRUCTURAL_PYTEST_SHARD_EXPRESSION})`
    );
    for (const shard of shards) {
      expect(shard.files).toEqual([...STRUCTURAL_PYTEST_FILES]);
      expect(shard.command).toContain('--durations=20 -v');
      // Each shard fans out over two xdist workers (both shards overlap).
      expect(shard.command).toContain('-m pytest -n 2 ');
      // Shards overlap in the pool: no shared .pytest_cache or basetemp.
      expect(shard.command).toContain('-p no:cacheprovider');
      expect(structuralLocks(shard.command)).toEqual([]);
    }
    expect(
      new Set(
        shards.map(shard => /--basetemp="([^"]+)"/u.exec(shard.command)?.[1])
      ).size
    ).toBe(2);
    // Both shards run in the operations structural lane, wrapped in the same
    // hosted dependency policy as the other structural Python regressions.
    expect(STRUCTURAL_PYTHON_REGRESSION_COMMANDS.slice(1)).toEqual(
      STRUCTURAL_PYTEST_SHARD_COMMANDS.map(command =>
        expect.stringContaining(`then ${command}; elif`)
      )
    );
  });

  it('runs the scanner-heavy invariant suites outside the V8-coverage node --test batch', () => {
    // Coverage instrumentation made these in-process scanners several times
    // slower (latency: 18s -> 118s locally) while contributing nothing to the
    // batch's --test-coverage-include files. Each must still run exactly once.
    const segments = PACKAGE_JSON.scripts['invariants:check'].split(' && ');
    const latency = 'scripts/invariants/latency-sensitive-execution.test.mjs';
    const screenCertification =
      'scripts/invariants/screen-certification.test.mjs';
    for (const suite of [latency, screenCertification]) {
      const running = segments.filter(segment => segment.includes(suite));
      expect(running).toEqual([
        `node --test ${screenCertification} ${latency}`,
      ]);
    }
    const coverageBatch = segments.find(segment =>
      segment.includes(
        '--test-coverage-include=scripts/backlog-orchestrator/reconcile.mjs'
      )
    );
    expect(coverageBatch).toBeDefined();
    expect(coverageBatch).not.toContain(latency);
    expect(coverageBatch).not.toContain(screenCertification);
  });

  it('runs desktop release regressions with measured coverage for mac changes', () => {
    expect(DESKTOP_RELEASE_COVERAGE_COMMAND).toContain(
      '--test-coverage-include=scripts/desktop-release-assets.mjs'
    );
    expect(DESKTOP_RELEASE_COVERAGE_COMMAND).toContain(
      '--test-coverage-lines=75 --test-coverage-branches=88 --test-coverage-functions=65'
    );
    expect(DESKTOP_RELEASE_COVERAGE_COMMAND).toContain(
      '--test-coverage-include=apps/desktop/scripts/notarize-release-dmg.cjs --test-coverage-lines=75 --test-coverage-branches=100 --test-coverage-functions=50'
    );
    expect(DESKTOP_RELEASE_COVERAGE_COMMAND).toContain(
      'scripts/desktop-release-guard.test.mjs scripts/desktop-release-publisher.test.mjs'
    );
    expect(LANE_COMMANDS.structural).toContain(
      DESKTOP_RELEASE_COVERAGE_COMMAND
    );

    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(
      /STRUCTURAL_DESKTOP_PATTERN='([^']+)'/
    )?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'scripts/desktop-release-assets.mjs',
      'scripts/desktop-release-guard.test.mjs',
      'scripts/desktop-release-publisher.test.mjs',
      'apps/desktop/electron-builder.yml',
      'apps/desktop/electron-builder.staging.yml',
      'apps/desktop/scripts/notarize-release-dmg.cjs',
    ]) {
      expect(
        spawnSync('grep', ['-qE', pattern], {
          input: `${path}\n`,
          encoding: 'utf8',
        }).status,
        path
      ).toBe(0);
    }
    expect(CI_FAST_SOURCE).toContain(
      "...(selected.has('mac') ? macParts : [])"
    );
  });

  it('selects the enforced shutdown proof for runtime-only PRs', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(
      /STRUCTURAL_CONTROL_PATTERN='([^']+)'/
    )?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'scripts/symphony/symphony_official_runtime.py',
      'scripts/symphony/tests/run-runtime-proof-gate.py',
      'scripts/symphony/tests/symphony-burrito-workflow.test.py',
    ]) {
      const match = spawnSync('grep', ['-Eq', pattern], {
        input: `${path}\n`,
        encoding: 'utf8',
      });
      expect(match.status, path).toBe(0);
    }
    expect(CI_FAST_SOURCE).toContain(
      "'python3 scripts/symphony/tests/run-runtime-proof-gate.py'"
    );
  });

  it('selects and runs alignment regressions for source-only changes', () => {
    const pattern = WORKFLOW.match(/STRUCTURAL_CONTROL_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'scripts/symphony/align-runner-source-revision.sh',
      'scripts/symphony/tests/align-runner-source-revision.test.sh',
    ]) {
      expect(
        spawnSync('grep', ['-Eq', pattern], {
          input: `${path}\n`,
          encoding: 'utf8',
        }).status,
        path
      ).toBe(0);
    }
    expect(CI_FAST_SOURCE).toContain(
      "'bash scripts/symphony/tests/align-runner-source-revision.test.sh'"
    );
  });

  it('runs Linux restart boundary tests when the helper or its proof changes', () => {
    const pattern = WORKFLOW.match(/STRUCTURAL_CONTROL_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'scripts/symphony/symphony-elixir-safe-restart',
      'scripts/symphony/tests/run-safe-restart-gate.py',
      'scripts/symphony/tests/symphony-safe-restart.test.py',
    ]) {
      const result = spawnSync('grep', ['-Eq', pattern], {
        input: `${path}\n`,
        encoding: 'utf8',
      });
      expect(result.status, path).toBe(0);
    }
    expect(CI_FAST_SOURCE).toContain(
      "'python3 scripts/symphony/tests/run-safe-restart-gate.py'"
    );
  });

  it('selects the crawler state proof through the maintained Storybook browser path', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(/CRAWLER_STORYBOOK_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    for (const path of [
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.tsx',
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.stories.tsx',
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard.tsx',
      'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard.stories.tsx',
      'apps/web/tests/e2e/storybook-ai-crawler.spec.ts',
    ]) {
      expect(
        spawnSync('grep', ['-qE', pattern], {
          input: `${path}\n`,
          encoding: 'utf8',
        }).status,
        path
      ).toBe(0);
    }
    expect(
      spawnSync('grep', ['-qE', pattern], {
        input:
          'apps/web/components/features/dashboard/organisms/OtherDialog.tsx\n',
        encoding: 'utf8',
      }).status
    ).not.toBe(0);

    const selector = remaining
      .split('id: storybook-browser\n')[1]
      .split('      - name: Start ci-fast lanes')[0];
    const command = selector
      .split('run: |\n')[1]
      .replaceAll('${{ github.event_name }}', 'pull_request')
      .replaceAll('${{ github.base_ref }}', 'main');
    const root = mkdtempSync(join(tmpdir(), 'crawler-storybook-selection-'));
    try {
      const output = join(root, 'output');
      const result = spawnSync(
        'bash',
        ['-c', 'git() { printf "%s\\n" "$CHANGED_PATHS"; }\n' + command],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            CHANGED_PATHS:
              'apps/web/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.stories.tsx',
            RUNNER_TEMP: root,
            GITHUB_OUTPUT: output,
          },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(
        Object.fromEntries(
          readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('='))
        )
      ).toEqual({
        run: 'true',
        spotify: 'false',
        kbd: 'false',
        crawler: 'true',
      });

      const runner = remaining
        .split('id: storybook-browser-test')[1]
        .split('      - name: Upload Storybook browser evidence')[0];
      const selection = runner.slice(
        runner.indexOf('          specs=()'),
        runner.indexOf('          pnpm exec storybook dev')
      );
      const chosen = spawnSync(
        'bash',
        ['-c', selection + '\nprintf "%s\\n" "${specs[@]}"'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            RUN_SPOTIFY: 'false',
            RUN_KBD: 'false',
            RUN_CRAWLER: 'true',
          },
        }
      );
      expect(chosen.status, chosen.stderr).toBe(0);
      expect(chosen.stdout.trim().split('\n')).toEqual([
        'tests/e2e/storybook-ai-crawler.spec.ts',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs existing Kbd and Spotify Storybook specs through the scanned evidence path', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const runner = remaining
      .split('id: storybook-browser-test')[1]
      .split('      - name: Upload Storybook browser evidence')[0];
    const selection = runner.slice(
      runner.indexOf('          specs=()'),
      runner.indexOf('          pnpm exec storybook dev')
    );
    const chosen = spawnSync(
      'bash',
      ['-c', selection + '\nprintf "%s\\n" "${specs[@]}"'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          RUN_SPOTIFY: 'true',
          RUN_KBD: 'true',
          RUN_CRAWLER: 'false',
        },
      }
    );
    expect(chosen.status, chosen.stderr).toBe(0);
    const specs = chosen.stdout.trim().split('\n');
    expect(specs).toEqual([
      'tests/e2e/storybook-spotify-connect.spec.ts',
      'tests/e2e/storybook-kbd-motion.spec.ts',
    ]);
    for (const spec of specs) {
      expect(existsSync(resolve(REPO_ROOT, 'apps/web', spec)), spec).toBe(true);
    }
    expect(runner).toContain("PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true'");
    const uploader = remaining
      .split('      - name: Upload Storybook browser evidence')[1]
      .split('      - name: Upload ci-fast lane results')[0];
    expect(uploader).toContain("allow-markdown: 'true'");
  });

  it('runs certification rejection regressions with measured coverage in the web structural lane', () => {
    const webParts = CI_FAST_SOURCE.slice(
      CI_FAST_SOURCE.indexOf('const webParts = ['),
      CI_FAST_SOURCE.indexOf(
        'const parts = [',
        CI_FAST_SOURCE.indexOf('const webParts = [')
      )
    );
    expect(CERTIFICATION_KERNEL_COMMAND).toContain(
      'tests/unit/agent-os/certification.test.ts --coverage.enabled --coverage.provider=v8 --coverage.include=lib/agent-os/certification.ts'
    );
    expect(CERTIFICATION_KERNEL_COMMAND).toContain(
      '--coverage.thresholds.lines=94 --coverage.thresholds.statements=93 --coverage.thresholds.branches=84 --coverage.thresholds.functions=96'
    );
    expect(webParts).not.toContain('--passWithNoTests');
    expect(webParts).toContain('CERTIFICATION_KERNEL_COMMAND');
    expect(LANE_COMMANDS.structural).toContain(CERTIFICATION_KERNEL_COMMAND);
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = remaining.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeDefined();
    expect(
      spawnSync('grep', ['-qE', pattern], {
        input: 'apps/web/lib/agent-os/certification.ts\n',
      }).status
    ).toBe(0);
  });

  it('admits acquisition-only and shared CAS edits to measured structural tests', () => {
    const pattern = WORKFLOW.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeDefined();
    for (const path of [
      'apps/web/lib/acquisition/certification-store.ts',
      'apps/web/lib/acquisition/certification-store.test.ts',
      'apps/web/lib/agent-os/certification-cas.ts',
      'apps/web/lib/agent-os/certification-adapter.ts',
    ]) {
      expect(
        spawnSync('grep', ['-qE', pattern], { input: `${path}\n` }).status,
        path
      ).toBe(0);
    }
    expect(LANE_COMMANDS.structural).toContain(
      ACQUISITION_CERTIFICATION_COMMAND
    );
    expect(ACQUISITION_CERTIFICATION_COMMAND).toContain(
      'lib/acquisition/certification-store.test.ts lib/agent-os/certification-adapter.test.ts'
    );
    expect(ACQUISITION_CERTIFICATION_COMMAND).toContain(
      '--coverage.thresholds.perFile=true'
    );
    expect(ACQUISITION_CERTIFICATION_COMMAND).not.toContain(
      '--passWithNoTests'
    );
    const webParts = CI_FAST_SOURCE.slice(
      CI_FAST_SOURCE.indexOf('const webParts = [')
    );
    expect(webParts).toContain('ACQUISITION_CERTIFICATION_COMMAND,');
  });

  it('covers every lane exactly once across the explicit hosted groups', () => {
    const laneIds = Object.values(LANE_GROUPS).flat();

    expect(new Set(laneIds).size).toBe(laneIds.length);
    expect([...laneIds].sort()).toEqual([
      'billing-coverage',
      'biome',
      'copy-gate',
      'design-conformance',
      'design-exception-registry',
      'design-governance-enforcement',
      'design-system-source-ratchet',
      'eslint-server-boundaries',
      'guardrails',
      'ios-fast',
      'profile-admission',
      'scripts-typecheck',
      'shadcn-lint-contracts',
      'structural',
      'typecheck',
      'web-tests-typecheck',
    ]);
    expect(validateLaneGroups(LANE_GROUPS)).toBe(true);
    expect(() =>
      validateLaneGroups({ typecheck: ['typecheck'], remaining: ['typecheck'] })
    ).toThrow(/duplicated/);
    expect(() =>
      validateLaneGroups({ typecheck: ['typecheck'], remaining: ['biome'] })
    ).toThrow(/missing/);
    expect(() =>
      validateLaneGroups({ typecheck: ['unknown'], remaining: [] })
    ).toThrow(/unknown/);
  });

  it('skips forced typecheck on source PRs with no TypeScript graph files', () => {
    expect(CI_FAST_SOURCE).toContain('No TypeScript graph files changed');
    expect(CI_FAST_SOURCE).toContain('pnpm turbo typecheck --affected --force');
    expect(CI_FAST_SOURCE).toContain('affectsJovieTypecheck');
    expect(CI_FAST_SOURCE).toContain(
      'files.some(file => affectsJovieTypecheck(file))'
    );
  });

  it('gates the web test typecheck ratchet on its compiled inputs', () => {
    for (const file of [
      'apps/web/tests/unit/chat/turns.test.ts',
      'apps/web/lib/rate-limit/types.ts',
      'apps/web/tsconfig.test.json',
      'apps/web/typecheck-tests-baseline.json',
      '.github/scripts/guard-playwright-artifacts.mjs',
    ]) {
      expect(affectsWebTestTypecheck(file), file).toBe(true);
    }
    for (const file of ['docs/PR_FLOW.md', 'apps/web/app/globals.css']) {
      expect(affectsWebTestTypecheck(file), file).toBe(false);
    }
    expect(CI_FAST_SOURCE).toContain(
      'files.some(file => affectsWebTestTypecheck(file))'
    );
    expect(LANE_GROUPS.typecheck).toContain('web-tests-typecheck');
  });

  it('preselects source-PR typecheck before dependency hydration', () => {
    const typecheck = jobBlock('ci-fast-typecheck', 'ci-fast-remaining');

    expect(typecheck).toContain('filter: blob:none');
    expect(typecheck).toMatch(
      /uses: \.\/\.github\/actions\/setup-node-pnpm\n\s+if: >-\n\s+github\.event_name != 'pull_request' \|\|\n\s+needs\.ci-path-changes\.outputs\.run_jovie_typecheck == 'true'/
    );
    expect(typecheck).toContain(
      'CI_FAST_RUN_JOVIE_TYPECHECK: ${{ needs.ci-path-changes.outputs.run_jovie_typecheck }}'
    );
    // The lane runner remains unconditional so the required job still emits a
    // lane receipt; it consumes the same path receipt that controls hydration.
    expect(typecheck).toMatch(
      /- name: Run ci-fast lanes\n\s+id: lanes\n(?!\s+if:)/
    );
    expect(typecheck).not.toContain('CI_FAST_PRESELECTED_SKIP');
    expect(typecheck).toMatch(
      /name: Validate CI\/release incident prevention contract[\s\S]*?run: node scripts\/ci-release-incident-contract\.mjs/
    );
  });

  it('uses the path preselection receipt when hydration is intentionally skipped', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-no-typecheck-'));
    const outPath = join(repo, 'ci-fast-lanes.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'typecheck',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_RUN_JOVIE_TYPECHECK: 'false',
            CI_FAST_ONLY_STRUCTURAL: 'false',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_BASE_REF: 'main',
            TURBO_SCM_BASE: 'origin/main',
            PATH: repo,
          },
        }
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.lanes).toEqual([
        expect.objectContaining({ id: 'typecheck', status: 'skipped' }),
        expect.objectContaining({
          id: 'web-tests-typecheck',
          status: 'skipped',
        }),
      ]);
      for (const lane of payload.lanes) {
        expect(lane.logExcerpt).toContain('ci-path-changes preselection');
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('overlaps the two typecheck lanes, each under its own singleflight lock', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-overlap-'));
    const binDir = join(repo, 'bin');
    try {
      mkdirSync(binDir);
      // Each call waits for the other to start; a serial runner exits 9.
      writeFileSync(
        join(binDir, 'pnpm'),
        `#!/bin/sh\ntouch "$0.$$"\nfor i in 1 2 3 4 5 6 7 8 9 10; do\n  [ "$(ls "${binDir}" | wc -l)" -ge 3 ] && { echo "dir=$TYPECHECK_SINGLEFLIGHT_DIR"; exit 0; }\n  sleep 0.5\ndone\nexit 9\n`
      );
      chmodSync(join(binDir, 'pnpm'), 0o755);
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'typecheck',
            CI_FAST_LANES_OUT: join(repo, 'out.json'),
            CI_FAST_ONLY_STRUCTURAL: 'false',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            TYPECHECK_SINGLEFLIGHT_DIR: '',
            PATH: `${binDir}:${process.env.PATH}`,
          },
        }
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const { lanes } = JSON.parse(
        readFileSync(join(repo, 'out.json'), 'utf8')
      );
      expect(lanes.map(lane => [lane.id, lane.logExcerpt])).toEqual([
        ['typecheck', 'dir='],
        ['web-tests-typecheck', 'dir=.cache/typecheck-singleflight-tests'],
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'a product-owned root script changes',
      relativePath: 'scripts/product-tool.mjs',
    },
    {
      name: 'the scripts baseline changes',
      relativePath: 'scripts/typecheck-baseline.json',
    },
    {
      name: 'an imported script outside the project root changes',
      relativePath: '.github/scripts/product-tool.mjs',
    },
  ])('runs scripts typecheck when $name', ({ relativePath }) => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-product-script-'));
    const binDir = join(repo, 'bin');
    const outPath = join(repo, 'ci-fast-lanes.json');
    const changedPath = join(repo, relativePath);
    const runGit = args =>
      spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    try {
      mkdirSync(binDir, { recursive: true });
      mkdirSync(dirname(changedPath), { recursive: true });
      // Let unrelated lanes no-op while failing if the scripts lane dispatches
      // anything except the repository's exact typecheck command.
      writeFileSync(
        join(binDir, 'pnpm'),
        [
          '#!/bin/sh',
          'case "$*" in',
          '  "run typecheck:scripts") ;;',
          '  *typecheck:scripts*) exit 41 ;;',
          'esac',
          'printf "%s\\n" "$*"',
          '',
        ].join('\n')
      );
      chmodSync(join(binDir, 'pnpm'), 0o755);
      writeFileSync(changedPath, 'export const value = 1;\n');
      expect(runGit(['init', '--initial-branch=main']).status).toBe(0);
      expect(
        runGit(['config', 'user.email', 'ci-contract@jov.ie']).status
      ).toBe(0);
      expect(runGit(['config', 'user.name', 'CI Contract']).status).toBe(0);
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'base']).status).toBe(0);
      const baseSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
      writeFileSync(changedPath, 'export const value = 2;\n');
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'change product tool']).status).toBe(0);

      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'remaining',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_SKIP_STRUCTURAL: 'true',
            // Structural steps set CI_FAST_ONLY_STRUCTURAL=true in the runner
            // env; spawned ci-fast-lanes.mjs children inherit it and would
            // filter the lane list down to structural only. Pin it off here.
            CI_FAST_ONLY_STRUCTURAL: 'false',
            CI_PRODUCT_LANES: 'none',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_BASE_REF: 'main',
            TURBO_SCM_BASE: baseSha,
            PATH: `${binDir}:${process.env.PATH}`,
          },
        }
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.lanes).toContainEqual(
        expect.objectContaining({
          id: 'scripts-typecheck',
          status: 'success',
          logExcerpt: 'run typecheck:scripts',
        })
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('fails red when hydration is skipped but the exact diff requires typecheck', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-selector-mismatch-'));
    const outPath = join(repo, 'ci-fast-lanes.json');
    const runGit = args =>
      spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    try {
      expect(runGit(['init', '--initial-branch=main']).status).toBe(0);
      expect(
        runGit(['config', 'user.email', 'ci-contract@jov.ie']).status
      ).toBe(0);
      expect(runGit(['config', 'user.name', 'CI Contract']).status).toBe(0);
      mkdirSync(join(repo, 'apps/web'), { recursive: true });
      writeFileSync(
        join(repo, 'apps/web/package.json'),
        '{"name":"@jovie/web","scripts":{"typecheck":"tsc"}}\n'
      );
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'base']).status).toBe(0);
      const baseSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
      writeFileSync(
        join(repo, 'apps/web/package.json'),
        '{"name":"@jovie/web","scripts":{"typecheck":"tsc -b"}}\n'
      );
      expect(runGit(['add', '.']).status).toBe(0);
      expect(runGit(['commit', '-m', 'change typecheck graph']).status).toBe(0);

      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'typecheck',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_ONLY_STRUCTURAL: 'false',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_BASE_REF: 'main',
            TURBO_SCM_BASE: baseSha,
            // Model a false-negative preselector: setup was skipped, so pnpm
            // is intentionally unavailable. The lane must execute and fail.
            PATH: repo,
          },
        }
      );

      expect(result.status).not.toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.lanes).toEqual([
        expect.objectContaining({ id: 'typecheck', status: 'failure' }),
        expect.objectContaining({
          id: 'web-tests-typecheck',
          status: 'failure',
        }),
      ]);
      for (const lane of payload.lanes) {
        expect(lane.logExcerpt).toMatch(/pnpm.*not found/i);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('does not restore or save an unused local Turbo cache in either fast job', () => {
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      const block = jobBlock(jobId, nextJobId);
      expect(block).not.toContain('name: Cache Turbo');
      expect(block).not.toContain('path: .turbo');
      expect(block).not.toContain('runner.os }}-turbo-');
    }

    expect(CI_FAST_SOURCE).toContain('pnpm turbo typecheck --affected --force');
    expect(CI_FAST_SOURCE).not.toContain('turbo run');
  });

  it('warms web tsc incremental state without weakening the forced gate', () => {
    const typecheck = jobBlock('ci-fast-typecheck', 'ci-fast-remaining');
    const step = name =>
      typecheck.match(
        new RegExp(
          `- name: ${name}\\n(?<body>[\\s\\S]*?)(?=\\n      - name:|$)`
        )
      )?.groups?.body ?? '';
    const restore = step('Restore web tsc incremental state');
    const record = step('Record restored web tsc state');
    const save = step('Save web tsc incremental state');
    const cacheSha = '55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0';

    // The web package keeps compiling incrementally into the cached path.
    const webPackage = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'apps/web/package.json'), 'utf8')
    );
    expect(webPackage.scripts.typecheck).toContain(
      'tsc -p tsconfig.typecheck.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo'
    );

    // Restore: same hydration gate, pinned, lockfile+tsconfig keyed, prefix
    // fallback (tsc re-verifies every input hash, so older state is safe).
    expect(restore).toContain('id: web-tsbuildinfo');
    expect(restore).toMatch(
      /if: >-\n\s+github\.event_name != 'pull_request' \|\|\n\s+needs\.ci-path-changes\.outputs\.run_jovie_typecheck == 'true'/
    );
    expect(restore).toContain(`uses: actions/cache/restore@${cacheSha}`);
    expect(restore).toContain('path: apps/web/.cache/tsbuildinfo*\n');
    const configHash =
      "hashFiles('pnpm-lock.yaml', 'tsconfig.json', 'apps/web/tsconfig.json', 'apps/web/tsconfig.typecheck.json', 'apps/web/tsconfig.test.json')";
    expect(restore).toContain(
      `key: jovie-web-tsbuildinfo-v2-\${{ runner.os }}-\${{ ${configHash} }}-\${{ github.sha }}`
    );
    expect(restore).toContain(
      `jovie-web-tsbuildinfo-v2-\${{ runner.os }}-\${{ ${configHash} }}-\n`
    );
    expect(restore).toMatch(
      /\n\s+jovie-web-tsbuildinfo-v2-\$\{\{ runner\.os \}\}-\s*$/
    );
    expect(record).toContain(
      "hash=${{ hashFiles('apps/web/.cache/tsbuildinfo*') }}"
    );

    // Order: restore before the lanes, save after them.
    const at = marker => typecheck.indexOf(marker);
    expect(at('- name: Restore web tsc incremental state')).toBeLessThan(
      at('- name: Run ci-fast lanes')
    );
    expect(at('- name: Run ci-fast lanes')).toBeLessThan(
      at('- name: Save web tsc incremental state')
    );

    // Save: green lane, changed state, trusted refs only, never blocking.
    expect(save).toContain(`uses: actions/cache/save@${cacheSha}`);
    expect(save).toContain("steps.lanes.outcome == 'success' &&");
    expect(save).toContain(
      "hashFiles('apps/web/.cache/tsbuildinfo*') != steps.web-tsbuildinfo-restored.outputs.hash"
    );
    expect(save).toContain(
      "((github.event_name == 'push' && github.ref == 'refs/heads/main') ||"
    );
    expect(save).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository))'
    );
    for (const untrusted of [
      'merge_group',
      'pull_request_target',
      'workflow_run',
    ]) {
      expect(save).not.toContain(untrusted);
    }
    expect(save).toContain('continue-on-error: true');
    expect(save).toContain(
      'key: ${{ steps.web-tsbuildinfo.outputs.cache-primary-key }}'
    );

    // tsc-cache-warm.yml seeds main (merge_group can read main, not PRs):
    // trusted triggers, no secrets, same path and fallbacks, save after tsc.
    const warm = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/tsc-cache-warm.yml'),
      'utf8'
    );
    const header = warm.slice(0, warm.indexOf('\njobs:'));
    expect(header).toMatch(
      /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n\npermissions:\n {2}contents: read\n\n/m
    );
    expect(warm).toContain("github.ref == 'refs/heads/main' &&");
    expect(warm).not.toMatch(/secrets\.|TURBO_TOKEN|continue-on-error/);
    expect(warm).toContain('persist-credentials: false');
    const keys = body =>
      body.split('\n').filter(line => line.includes('jovie-web-tsbuildinfo'));
    const [ciKey, ...ciFallbacks] = keys(restore).map(line => line.trim());
    const [warmKey, ...warmFallbacks] = keys(warm).map(line => line.trim());
    expect(warmFallbacks).toEqual(ciFallbacks);
    expect(warmKey.replace(/h\$\{\{ steps\.hour\.outputs\.hour }}$/, '')).toBe(
      ciKey.replace('${{ github.sha }}', '')
    );
    expect(
      warm.match(/path: apps\/web\/\.cache\/tsbuildinfo\*\n/g)
    ).toHaveLength(2);
    const order = [
      'Restore web tsc incremental state',
      'run: |\n          pnpm --filter @jovie/web run typecheck\n          pnpm --filter @jovie/web run typecheck:tests\n',
      'uses: actions/cache/save@',
      'key: ${{ steps.web-tsbuildinfo.outputs.cache-primary-key }}',
    ].map(marker => warm.indexOf(marker));
    expect(order.every((at, i) => at > (order[i - 1] ?? 0))).toBe(true);

    // The gate itself is unchanged: turbo never replays a cached verdict.
    expect(CI_FAST_SOURCE).toContain('pnpm turbo typecheck --affected --force');
  });

  it('isolates Jovie product typecheck from Symphony/control-plane suites', () => {
    expect(CI_FAST_SOURCE).toContain("from './lib/ci-repo-lanes.mjs'");
    expect(CI_FAST_SOURCE).toContain(
      'Jovie product typecheck skipped (no product files changed)'
    );
    const scriptsTypecheck = CI_FAST_SOURCE.slice(
      CI_FAST_SOURCE.indexOf('function runScriptsTypecheck()'),
      CI_FAST_SOURCE.indexOf('function runGuardrails()')
    );
    expect(scriptsTypecheck).toContain('pnpm run typecheck:scripts');
    expect(scriptsTypecheck).not.toContain('changedFiles');
    expect(scriptsTypecheck).not.toContain('runSymphonyControl');
    expect(CI_FAST_SOURCE).toContain(
      'Guardrails skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Design conformance skipped (no design-domain files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Design-system source ratchet skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Design exception registry skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Public-profile admission skipped (no Jovie product files changed)'
    );
    expect(CI_FAST_SOURCE).toContain(
      'Structural skipped (Summer/ops only; no Jovie or Symphony suites)'
    );
    expect(CI_FAST_SOURCE).toContain('No guardrail product lane selected');
    expect(CI_FAST_SOURCE).toContain(
      "process.env.CI_PRODUCT_LANES || 'ios,mac,web,operations,cross-product'"
    );
    expect(CI_FAST_SOURCE).toContain('files === null || files.length === 0');
  });

  it('runs the official Symphony recovery ownership contract with exact changed-line coverage', () => {
    expect(PACKAGE_JSON.scripts['invariants:check']).toContain(
      'python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py OfficialServiceOwnershipContract OfficialServiceCoverageContract'
    );
    expect(CI_FAST_SOURCE).toContain(
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.coverage"'
    );
    expect(CI_FAST_SOURCE).toContain(
      'python3 -m coverage run --branch scripts/symphony/tests/symphony-codex-auth-fallback.test.py OfficialServiceOwnershipContract'
    );
    expect(CI_FAST_SOURCE).toContain(
      'python3 -m coverage json -o "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json"'
    );
    expect(CI_FAST_SOURCE).toContain(
      'python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py --verify-ownership-coverage "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json"'
    );
  });

  it('runs the Astra readiness contract with branch coverage', () => {
    expect(CI_FAST_SOURCE).toContain(
      'python3 -m coverage run --branch scripts/symphony/tests/astra-readiness.test.py'
    );
    expect(CI_FAST_SOURCE).toContain(
      '--include="*/scripts/symphony/astra/astra_readiness.py" --show-missing --precision=2 --fail-under=90'
    );
  });

  it('maps the exact hosted selector set to dedicated parallel jobs', () => {
    const hostedSelectors = HOSTED_GROUP_JOBS.map(({ jobId, nextJobId }) => {
      const block = jobBlock(jobId, nextJobId);
      const selector = block.match(/CI_FAST_LANE_GROUP:\s*([^\s]+)/)?.[1];
      expect(selector, `missing hosted selector in ${jobId}`).toBeDefined();
      expect(block).toContain(`name: ci-fast (${selector})`);
      expect(block).toMatch(
        /needs: \[ci-lockfile-preflight, ci-path-changes, ci-merge-group-admission\]/
      );
      expect(block).toMatch(/if: (&[\w-]+ )?>-\s+!cancelled\(\) &&/);
      expect(block).not.toContain('always()');
      expect(block).toMatch(/needs\.ci-path-changes\.result == 'success'/);
      expect(block).toMatch(/github\.event_name != 'merge_group'/);
      expect(block).toMatch(
        /needs\.ci-merge-group-admission\.result == 'success'/
      );
      return selector;
    });

    expect(new Set(hostedSelectors).size).toBe(hostedSelectors.length);
    expect([...hostedSelectors].sort()).toEqual(
      [...Object.keys(LANE_GROUPS)].sort()
    );
  });

  it('fails closed for invalid selections while preserving local all-lanes default', () => {
    expect(selectLanes().map(lane => lane.id)).toEqual([
      'biome',
      'eslint-server-boundaries',
      'shadcn-lint-contracts',
      'typecheck',
      'web-tests-typecheck',
      'scripts-typecheck',
      'guardrails',
      'design-system-source-ratchet',
      'design-exception-registry',
      'design-governance-enforcement',
      'design-conformance',
      'ios-fast',
      'profile-admission',
      'billing-coverage',
      'copy-gate',
      'structural',
    ]);
    expect(selectLanes('typecheck').map(lane => lane.id)).toEqual([
      'typecheck',
      'web-tests-typecheck',
    ]);
    expect(selectLanes('remaining').map(lane => lane.id)).toEqual(
      LANE_GROUPS.remaining
    );
    expect(() => selectLanes('')).toThrow(/non-empty/);
    expect(() => selectLanes('missing')).toThrow(/Unknown/);
  });

  it('locks the existing lane command manifest', () => {
    expect(LANE_COMMANDS).toEqual({
      biome: 'pnpm run biome:check',
      'design-conformance': 'pnpm design:conformance:gate',
      'eslint-server-boundaries':
        'pnpm --filter=@jovie/web run lint:server-boundaries',
      'shadcn-lint-contracts':
        'pnpm --filter=@jovie/web run lint:shadcn-contracts',
      typecheck: 'pnpm run typecheck',
      'web-tests-typecheck': 'pnpm --filter=@jovie/web run typecheck:tests',
      'scripts-typecheck': 'pnpm run typecheck:scripts',
      guardrails: 'pnpm next:proxy-guard',
      'design-system-source-ratchet': 'pnpm design:source-count-ratchet',
      'design-exception-registry': 'pnpm design:exception-registry:check',
      'design-governance-enforcement':
        'pnpm design:authority:check && pnpm design:tokens:export:check && pnpm design:governance:audit && pnpm --filter @jovie/web run lint:touch-target',
      'ios-fast': 'pnpm run ios:lint',
      'profile-admission':
        'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts lib/profile/capture-dismissal-client.test.ts components/features/release/SmartLinkProviderButton.test.tsx tests/unit/api/profile/capture-dismissal.test.ts tests/unit/api/profile/pac-event.test.ts tests/unit/lib/rate-limit/config.test.ts tests/unit/lib/rate-limit/limiters.test.ts tests/unit/profile/ProfileHomeRail.test.tsx tests/unit/cookie-banner-fixes.test.tsx tests/unit/tracking/pac-events.test.ts components/features/profile/templates/PublicProfileLayoutShell.test.tsx components/features/profile/templates/ProfileDesktopSurface.test.tsx tests/unit/profile/profile-compact-template.test.tsx components/providers/QueryProvider.test.tsx --coverage --coverage.include="components/providers/QueryProvider.tsx" --coverage.include="components/features/profile/templates/{PublicProfileLayoutShell,ProfileDesktopSurface,ProfileCompactTemplate}.tsx" --coverage.reportsDirectory=coverage/profile-admission --coverage.thresholds.lines=75 --coverage.thresholds.branches=70 --coverage.thresholds.functions=60',
      'billing-coverage': BILLING_COVERAGE_COMMAND,
      'copy-gate': COPY_GATE_COMMAND,
      structural:
        'pnpm invariants:check && pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm design:shared-ui-visual-arbitrary:check && pnpm component-ship-gate && pnpm screen-registration-gate && pnpm doc:freshness:check && pnpm test:reliability-detectors' +
        ' && ' +
        MARKETING_CERTIFICATION_COMMAND +
        ' && ' +
        CERTIFICATION_KERNEL_COMMAND +
        ' && ' +
        ACQUISITION_CERTIFICATION_COMMAND +
        ' && ' +
        DESKTOP_RELEASE_COVERAGE_COMMAND +
        ' && ' +
        OFFLINE_FAILURE_COVERAGE_COMMAND,
    });
    expect(CI_FAST_SOURCE).toContain(
      "'pnpm design:shared-ui-visual-arbitrary:check'"
    );
  });

  it('keeps the iOS design gate independent from Ubuntu operations', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const structuralDecision = remaining.slice(
      remaining.indexOf('- name: Decide structural lane'),
      remaining.indexOf('- name: Run actionlint (structural)')
    );

    expect(LANE_GROUPS.remaining).toContain('design-conformance');
    expect(LANE_GROUPS.remaining).toContain('design-system-source-ratchet');
    expect(LANE_GROUPS.remaining).toContain('design-exception-registry');
    expect(LANE_GROUPS.remaining).toContain('shadcn-lint-contracts');
    expect(LANE_COMMANDS['design-conformance']).toBe(
      'pnpm design:conformance:gate'
    );
    expect(LANE_COMMANDS['design-system-source-ratchet']).toBe(
      'pnpm design:source-count-ratchet'
    );
    expect(LANE_COMMANDS['design-system-source-ratchet']).not.toMatch(
      /vitest|playwright|e2e/i
    );
    expect(LANE_COMMANDS['design-exception-registry']).toBe(
      'pnpm design:exception-registry:check'
    );
    expect(LANE_GROUPS.remaining).toContain('billing-coverage');
    expect(LANE_COMMANDS['billing-coverage']).toBe(BILLING_COVERAGE_COMMAND);
    expect(BILLING_PROVENANCE_COVERAGE_COMMAND).toContain(
      'tests/unit/lib/entitlements/creator-plan.test.ts'
    );
    expect(BILLING_PROVENANCE_COVERAGE_COMMAND).toContain(
      'tests/unit/lib/stripe/customer-sync.queries.test.ts'
    );
    expect(BILLING_PROVENANCE_COVERAGE_COMMAND).toContain(
      'lib/stripe/test-price-contract.test.ts'
    );
    expect(BILLING_PROVENANCE_COVERAGE_COMMAND).toContain(
      '--coverage.include=lib/stripe/test-price-contract.ts'
    );
    expect(BILLING_PROVENANCE_COVERAGE_COMMAND).toContain(
      '--coverage.thresholds.perFile=true'
    );
    expect(FAN_SEND_SAFETY_COVERAGE_COMMAND).toContain(
      'tests/lib/notifications/service.test.ts'
    );
    expect(FAN_SEND_SAFETY_COVERAGE_COMMAND).toContain(
      '--coverage.thresholds.lines=70'
    );
    expect(LANE_COMMANDS['design-exception-registry']).not.toMatch(
      /vitest|playwright|e2e/i
    );
    expect(LANE_COMMANDS['design-conformance']).not.toMatch(
      /backlog|hermes|symphony|systemd/i
    );
    expect(structuralDecision).not.toContain('apps/ios/');
    expect(structuralDecision).toContain('echo "skip=true"');
    expect(structuralDecision).toContain(
      'scripts/backlog-orchestrator/(admission-gate|context-gate|deterministic-gates|gbrain-client|gate-next-hold|shipping-lead-gate|ownership-inventory|symphony-(routing|official-runtime))'
    );
    expect(structuralDecision).toContain(
      'scripts/backlog-orchestrator/__tests__/(backlog-orchestrator|pre-lease-gates|gate-next-hold|shipping-lead-gate|ownership-inventory|symphony-(routing|official-runtime))\\.test\\.mjs$'
    );
    expect(structuralDecision).toContain('canon/invariants\\.jsonl');
    expect(structuralDecision).toContain('scripts/invariants/');
    expect(CI_FAST_SOURCE).toMatch(
      /function runDesignConformance\([^)]*\)[\s\S]*LANE_COMMANDS\['design-conformance'\]/
    );
    expect(CI_FAST_SOURCE).toMatch(
      /function runDesignSystemSourceRatchet\(\)[\s\S]*LANE_COMMANDS\['design-system-source-ratchet'\]/
    );
    expect(CI_FAST_SOURCE).toMatch(
      /function runDesignExceptionRegistry\(\)[\s\S]*LANE_COMMANDS\['design-exception-registry'\]/
    );
  });

  it('runs billing provenance coverage when the Artist Visibility price contract changes', () => {
    expect(BILLING_PROVENANCE_COVERAGE_PATHS).toEqual(
      expect.arrayContaining([
        'apps/web/lib/stripe/test-price-contract.ts',
        'apps/web/lib/stripe/test-price-contract.test.ts',
      ])
    );

    const commands = selectBillingCoverageCommands({
      event: 'pull_request',
      provenanceFiles: ['apps/web/lib/stripe/test-price-contract.ts'],
      fanSendFiles: [],
    });

    expect(commands).toEqual([BILLING_PROVENANCE_COVERAGE_COMMAND]);
  });

  it('fails closed onto structural UI gates for every web UI source and guard', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const structuralDecision = remaining.slice(
      remaining.indexOf('- name: Decide structural lane'),
      remaining.indexOf('- name: Run actionlint (structural)')
    );

    for (const requiredPath of [
      'apps/web/app/.*\\.(tsx|css)$',
      'apps/web/components/',
      'apps/web/\\.storybook/',
      'apps/web/package\\.json$',
      'apps/web/scripts/',
      'apps/web/tests/',
      'apps/web/styles/',
      'packages/ui/',
      'chromatic\\.config\\.json$',
      'package\\.json$',
      'DESIGN\\.md$',
      'design\\.tokens\\.json$',
      'scripts/(component-',
      'screen-certification',
      'shared-ui-visual-arbitrary',
      'story-coverage',
      'ui-story-coverage',
      'scripts/lib/__tests__/(component-',
    ]) {
      expect(structuralDecision).toContain(requiredPath);
    }
    expect(structuralDecision).toContain(
      'grep -qE "$STRUCTURAL_CONTROL_PATTERN|$STRUCTURAL_UI_PATTERN|$STRUCTURAL_DESKTOP_PATTERN"'
    );
    expect(remaining).toMatch(/timeout-minutes:\s*40/);
    expect(remaining).toContain('uses: ./.github/actions/setup-playwright');
    expect(CI_FAST_SOURCE).toContain(
      'lib/__tests__/component-live-storybook-certification.test.mjs'
    );
  });

  it('selects structural CI for marketing registry-only edits and enforces per-file coverage', () => {
    const pattern = WORKFLOW.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeDefined();
    for (const path of [
      'apps/web/data/marketing/componentRegistry.ts',
      'apps/web/data/marketing/routeManifest.ts',
      'apps/web/data/marketing/sections.ts',
    ]) {
      const selected = spawnSync('grep', ['-qE', pattern], {
        input: `${path}\n`,
      });
      expect(selected.status, path).toBe(0);
    }
    const marketingAlt = 'apps/web/data/marketing/';
    expect(pattern).toContain(`${marketingAlt}|`);
    const stripped = pattern.replace(`${marketingAlt}|`, '');
    expect(stripped).not.toBe(pattern);
    for (const path of [
      'apps/web/data/marketing/componentRegistry.ts',
      'apps/web/data/marketing/routeManifest.ts',
      'apps/web/data/marketing/sections.ts',
    ]) {
      const red = spawnSync('grep', ['-qE', stripped], {
        input: `${path}\n`,
      });
      expect(red.status, `deliberate-red ${path}`).not.toBe(0);
    }
    const start = CI_FAST_SOURCE.indexOf('const webParts = [');
    const web = CI_FAST_SOURCE.slice(
      start,
      CI_FAST_SOURCE.indexOf('const parts = [', start)
    );
    expect(web).toContain('MARKETING_CERTIFICATION_COMMAND');
    const command = MARKETING_CERTIFICATION_COMMAND;
    expect(LANE_COMMANDS.structural).toContain(command);
    for (const selector of [
      'app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.test.tsx',
      'components/homepage/HomepageNoScriptContent.test.tsx',
      'components/marketing/MarketingHero.test.tsx',
      'tests/unit/home/HomepageCertifiedSections.test.tsx',
      'tests/unit/home/HomepageEditorialHero.test.tsx',
      'tests/unit/marketing/component-registry.test.ts',
      'tests/unit/marketing/recipe-manifest.test.ts',
      'tests/unit/marketing/route-health-contract.test.ts',
      'components/site/PublicPageShell.test.tsx',
      '--coverage.enabled',
      '--coverage.provider=v8',
      '--coverage.include=data/marketing/componentRegistry.ts',
      '--coverage.include=data/marketing/routeManifest.ts',
      '--coverage.include=data/marketing/sections.ts',
      '--coverage.include=components/marketing/MarketingHero.tsx',
      '--coverage.thresholds.perFile=true',
      '--coverage.thresholds.lines=80',
      '--coverage.thresholds.statements=80',
      '--coverage.thresholds.branches=75',
      '--coverage.thresholds.functions=75',
    ])
      expect(command).toContain(selector);
    expect(command).not.toContain('passWithNoTests');
  });

  it('runs the lockfile specifier preflight before expensive fast lanes', () => {
    const preflight = jobBlock('ci-lockfile-preflight', 'ci-path-changes');
    expect(preflight).toContain('name: Lockfile Specifier Preflight');
    expect(preflight).toContain(
      'run: node scripts/lockfile-specifier-preflight.mjs'
    );
    expect(preflight).toContain(
      'run: node scripts/verify-workflow-references.mjs'
    );
    // Dependency-free preflight: plain setup-node from .nvmrc, no pnpm install.
    expect(preflight).toMatch(
      /uses: actions\/setup-node@[0-9a-f]{40} # v\d+[\s\S]*node-version-file: '\.nvmrc'/
    );
    expect(preflight).not.toContain('setup-node-pnpm');
    expect(preflight).not.toMatch(/\bpnpm (?:exec|install|run)\b/);
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      expect(jobBlock(jobId, nextJobId)).toMatch(
        /needs: \[ci-lockfile-preflight, ci-path-changes, ci-merge-group-admission\]/
      );
    }
  });

  it('keeps workflow contracts in the bounded CI control suite', () => {
    expect(PACKAGE_JSON.scripts['ci:control:test']).toBe(
      'node scripts/run-affected-tests.mjs --control'
    );
    const controlStages = buildControlTestCommands();
    expect(controlStages).toContainEqual([
      'node',
      [
        '--test',
        '--experimental-test-coverage',
        '--test-coverage-include=scripts/symphony/control-bundle-manifest.mjs',
        '--test-coverage-lines=90',
        '--test-coverage-branches=75',
        '--test-coverage-functions=90',
        'scripts/symphony/tests/control-bundle-manifest.test.mjs',
      ],
    ]);
    expect(controlStages).toContainEqual([
      'pnpm',
      ['run', 'test:rolling-ci-fx:coverage'],
    ]);
    const fxCoverage = PACKAGE_JSON.scripts['test:rolling-ci-fx:coverage'];
    expect(fxCoverage).toContain('lib/__tests__/rolling-ci-fx.test.mjs');
    expect(fxCoverage).toContain('lib/__tests__/rolling-ci-fx-finish.test.mjs');
    expect(fxCoverage).toContain('lib/__tests__/fx-remediation-lane.test.mjs');
    expect(fxCoverage).toContain('lib/__tests__/rolling-ci-dispatch.test.mjs');
    expect(fxCoverage).toContain(
      'lib/{rolling-ci-fx,fx-remediation-lane,rolling-ci-dispatch,rolling-ci-fx-finish}.mjs'
    );
    expect(fxCoverage).toContain('--coverage.thresholds.perFile=true');
    expect(fxCoverage).toContain('--coverage.thresholds.lines=60');
    expect(fxCoverage).toContain('--coverage.thresholds.branches=60');
    expect(fxCoverage).toContain('--coverage.thresholds.functions=70');
  });

  it('enforces external shared health contract coverage for package and test changes', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    expect(remaining).toContain('packages/agent-transport-contracts/');
    expect(remaining).toContain('symphony-health-contract\\.test\\.mjs');
    expect(CI_FAST_SOURCE).toContain(
      "selected.has('operations') || selected.has('web')"
    );
    expect(CI_FAST_SOURCE).toContain(
      'lib/__tests__/symphony-health-contract.test.mjs --coverage --coverage.allowExternal'
    );
    expect(CI_FAST_SOURCE).toContain(
      '--coverage.include="$PWD/packages/agent-transport-contracts/symphony-outage.ts"'
    );
    expect(CI_FAST_SOURCE).toContain('--coverage.thresholds.lines=100');
  });

  it('selects structural coverage for native queue evidence and collector edits', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = [
      ...remaining.matchAll(/STRUCTURAL_CONTROL_PATTERN\+?='([^']+)'/g),
    ]
      .map(match => match[1])
      .join('');
    for (const path of [
      'scripts/native-queue-eval.mjs',
      'scripts/lib/native-queue-eval.mjs',
      'scripts/lib/native-queue-group-evidence.mjs',
      'scripts/lib/native-queue-policy-evidence.mjs',
      'scripts/lib/__tests__/native-queue-collector.test.mjs',
      'scripts/lib/__tests__/native-queue-eval.test.mjs',
      'scripts/lib/__tests__/native-queue-group-evidence.test.mjs',
      'scripts/lib/__tests__/native-queue-policy-evidence.test.mjs',
    ]) {
      const selected = spawnSync('grep', ['-qE', pattern], {
        input: `${path}\n`,
      });
      expect(selected.status, path).toBe(0);
    }
    for (const path of ['README.md', 'docs/native-queue-eval.mjs']) {
      const selected = spawnSync('grep', ['-qE', pattern], {
        input: `${path}\n`,
      });
      expect(selected.status, path).toBe(1);
    }
  });

  it('selects the existing control lane for conflict event entrypoint and proof edits', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = [
      ...remaining.matchAll(/STRUCTURAL_CONTROL_PATTERN\+?='([^']+)'/g),
    ]
      .map(match => match[1])
      .join('');
    for (const path of [
      'scripts/pr-conflict-handler.mjs',
      'scripts/lib/pr-conflict-handler.mjs',
      'scripts/lib/pr-conflict-event.mjs',
      'scripts/lib/github-open-prs-rest.mjs',
      'scripts/lib/__tests__/pr-conflict-handler.test.mjs',
      'scripts/lib/__tests__/pr-conflict-event.test.mjs',
      'scripts/lib/__tests__/github-open-prs-rest.test.mjs',
    ]) {
      const selected = spawnSync('grep', ['-qE', pattern], {
        input: `${path}\n`,
      });
      expect(selected.status, path).toBe(0);
    }
  });

  it('runs route-prep behavior coverage for probe and router edits', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const pattern = [
      ...remaining.matchAll(/STRUCTURAL_CONTROL_PATTERN\+='([^']+)'/g),
    ]
      .map(match => match[1])
      .find(part => part.includes('run-route-prep-coverage-gate'))
      ?.replace(/^\|/, '');
    expect(pattern).toBeTruthy();
    for (const path of [
      'scripts/symphony/codex-account-probe.sh',
      'scripts/symphony/symphony-agent-router',
      'scripts/symphony/tests/codex-account-probe.test.py',
      'scripts/symphony/tests/symphony-agent-router.test.py',
      'scripts/symphony/tests/run-route-prep-coverage-gate.py',
    ]) {
      const selected = spawnSync('grep', ['-qE', pattern], {
        input: `${path}\n`,
      });
      expect(selected.status, path).toBe(0);
    }
    for (const path of [
      'scripts/symphony/symphony-agent-router-extra',
      'scripts/symphony/symphony-codex-router',
      'scripts/symphony/tests/codex-recovery-ci.sh',
      'README.md',
    ]) {
      const selected = spawnSync('grep', ['-qE', pattern], {
        input: `${path}\n`,
      });
      expect(selected.status, path).toBe(1);
    }
    expect(CI_FAST_SOURCE).toContain(
      'python3 scripts/symphony/tests/run-route-prep-coverage-gate.py'
    );
    const coverage = WORKFLOW.slice(
      WORKFLOW.indexOf('  ci-exact-head-coverage:'),
      WORKFLOW.indexOf('  ci-a11y:')
    );
    expect(coverage).toContain("github.event_name == 'pull_request'");
    expect(coverage).toContain("github.event_name == 'merge_group'");
    expect(coverage).toContain('has_route_prep_coverage_changes');
    expect(coverage).toContain(
      'python3 scripts/symphony/tests/run-route-prep-coverage-gate.py'
    );
    expect(remaining).toContain('github.event_name }}" != "pull_request"');
    expect(remaining).toContain('echo "skip=false"');
  });

  it('runs native queue delivery regressions with coverage for executor changes', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    expect(remaining).toContain(
      '(run-native-queue-execution|native-queue-starvation-execute(\\.test)?)\\.mjs$'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test --experimental-test-coverage --test-coverage-include=scripts/symphony/native-queue-starvation-execute.mjs --test-coverage-lines=90 --test-coverage-branches=80 --test-coverage-functions=85 scripts/symphony/native-queue-starvation-execute.test.mjs'
    );
  });

  it('enforces meaningful Gem rehabilitation policy coverage in structural CI', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );

    expect(remaining).toContain(
      'install-(gem-(fleet-controller|pr-rehabilitation|symphony-storage)|symphony-ui-pilot)\\.sh$'
    );
    expect(remaining).toContain('jovie-symphony-workspace(-create)?$');
    expect(remaining).toContain('gbrain-runtime-assets|merge-group');
    expect(CI_FAST_SOURCE).toContain(
      'GBRAIN_PROXY_COVERAGE=1 pnpm exec vitest --root scripts'
    );
    expect(CI_FAST_SOURCE).toContain('--precision=2 --fail-under=78');
    expect(CI_FAST_SOURCE).toContain('elif [ "${CI:-}" = "true" ]');
    expect(CI_FAST_SOURCE).not.toContain('elif [[');
    expect(remaining).toContain('jovie-symphony-workspace\\.test\\.py$');
    expect(remaining).toContain('_gem_workspace_migrate)\\.py$');
    expect(remaining).toContain('summer_bottleneck_producer\\.py$');
    expect(remaining).toContain('summer-bottleneck-producer\\.test\\.py$');
    expect(remaining).toContain(
      'summer-symphony-outbox-(consumer(\\.test)?|contract\\.test)\\.mjs$'
    );
    expect(CI_FAST_SOURCE).toContain(
      'if [ -f scripts/symphony/summer-symphony-outbox-consumer.test.mjs ]; then node --test --experimental-test-coverage --test-coverage-include=scripts/symphony/summer-symphony-outbox-consumer.mjs --test-coverage-include=scripts/symphony/summer-shipping-lead-contract.mjs --test-coverage-lines=90 --test-coverage-branches=80 --test-coverage-functions=95 scripts/symphony/summer-symphony-outbox-consumer.test.mjs scripts/symphony/summer-symphony-outbox-contract.test.mjs scripts/symphony/summer-shipping-lead-contract.test.mjs; else node --test --experimental-test-coverage --test-coverage-include=scripts/symphony/summer-symphony-outbox-consumer.mjs --test-coverage-lines=78 --test-coverage-branches=54 --test-coverage-functions=90 scripts/symphony/summer-symphony-outbox-contract.test.mjs; fi'
    );
    expect(CI_FAST_SOURCE).toContain(
      'coverage run --branch scripts/symphony/tests/gem-rehabilitation-policy.test.py'
    );
    expect(CI_FAST_SOURCE).toContain(
      'coverage report --include="*/scripts/symphony/gem_rehabilitation_policy.py" --fail-under=90'
    );
    expect(CI_FAST_SOURCE).toContain(
      "node --test --test-name-pattern='keeps the Gem drain on typed fleet admission' scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs"
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test --experimental-test-coverage --test-coverage-include=scripts/backlog-orchestrator/linear-client.mjs --test-coverage-lines=73 --test-coverage-branches=83 --test-coverage-functions=66 scripts/backlog-orchestrator/__tests__/linear-client.transport.test.mjs scripts/backlog-orchestrator/__tests__/linear-pagination.test.mjs'
    );
    for (const gemContractCommand of [
      'python3 scripts/symphony/tests/run-hud-proof-gate.py',
      'python3 scripts/symphony/tests/test_gem_disk_reclaim.py',
      'python3 scripts/symphony/tests/jovie-symphony-workspace.test.py',
      'python3 scripts/symphony/tests/test_gem_workspace_migrate.py',
      'python3 scripts/symphony/tests/gem-pr-drain.test.py',
      'GEM_CONTRACT_SHARD=installer python3 scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-delivery.coverage" GEM_CONTRACT_SHARD=coverage python3 -m coverage run --branch scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
      'coverage report --include="*/scripts/symphony/gem-repo-drain-cycle.py" --show-missing --precision=2 --fail-under=95',
      'python3 -m coverage run --branch scripts/symphony/tests/gem-priority-gate.test.py',
      'coverage report --include="*/scripts/symphony/gem-priority-gate.py" --show-missing --precision=2 --fail-under=84',
      'python3 -m coverage run --branch scripts/symphony/tests/test_fleet_admission_receipt.py',
      'coverage report --include="*/scripts/symphony/fleet_admission_receipt.py" --show-missing --precision=2 --fail-under=74',
      'python3 scripts/symphony/tests/symphony-nvme-package-cache.test.py',
      'python3 scripts/symphony/tests/test_evaluate_fleet_gate.py',
      'python3 scripts/symphony/tests/run-model-state-gate.py',
      'python3 scripts/symphony/tests/cursor-cli-worker.test.py',
      'python3 -m coverage run --branch scripts/symphony/tests/hyperagent-lifecycle.test.py',
      'python3 scripts/symphony/tests/symphony-github-poke.test.py',
    ]) {
      expect(CI_FAST_SOURCE).toContain(gemContractCommand);
    }
    expect(CI_FAST_SOURCE).toContain(
      '--include="*/scripts/symphony/hyperagent/lifecycle.py" --show-missing --precision=2 --fail-under=95'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test scripts/backlog-orchestrator/__tests__/pre-lease-gates.test.mjs'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test scripts/backlog-orchestrator/__tests__/gate-next-hold.test.mjs'
    );
    expect(CI_FAST_SOURCE).toContain(
      'node --test scripts/backlog-orchestrator/__tests__/ownership-inventory.test.mjs'
    );
  });

  it('always materializes ci-fast-lanes.json even when setup fails (JOV-4446)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-fast-lanes-'));
    const outPath = join(dir, 'ci-fast-lanes.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'not-a-real-group',
            CI_FAST_LANES_OUT: outPath,
          },
        }
      );
      expect(result.status).not.toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(payload.schemaVersion).toBe(2);
      expect(payload.job).toBe('ci-fast');
      expect(payload.group).toBe('not-a-real-group');
      expect(payload.lanes).toEqual([]);
      expect(String(payload.setupError)).toMatch(/Unknown CI_FAST_LANE_GROUP/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records a non-negative duration for every emitted lane receipt', () => {
    expect(CI_FAST_SOURCE).toContain('durationMs');
    expect(CI_FAST_SOURCE).toContain('laneStartedAt');
    expect(CI_FAST_SOURCE).toContain('Date.now() - laneStartedAt');
  });

  it('uploads ci-fast lane artifacts with warn-not-error missing policy (JOV-4446)', () => {
    for (const { jobId, nextJobId } of HOSTED_GROUP_JOBS) {
      const block = jobBlock(jobId, nextJobId);
      expect(block).toContain(
        'CI_FAST_LANES_OUT: ${{ runner.temp }}/ci-fast-lanes.json'
      );
      expect(block).toContain('${{ runner.temp }}/ci-fast-lanes.json');
      expect(block).toContain('if-no-files-found: warn');
      expect(block).toMatch(
        /github\.event_name == 'merge_group' && github\.event\.merge_group\.base_sha/
      );
    }
  });

  it('overlaps structural setup with cheap lanes; structural awaits them', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const at = marker => remaining.indexOf(marker);
    // A failing background lane run fails the await step, with its log.
    const dir = mkdtempSync(join(tmpdir(), 'ci-fast-bg-'));
    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      LANES_DIR: `${dir}/bg`,
      GITHUB_STEP_SUMMARY: '/dev/null',
    };
    writeFileSync(`${dir}/node`, '#!/bin/sh\necho lane-log\nexit 3\n');
    chmodSync(`${dir}/node`, 0o755);
    const sh = name =>
      spawnSync(
        'bash',
        [
          '-eo',
          'pipefail',
          '-c',
          remaining
            .split(`name: ${name}`)[1]
            .split('run: |\n')[1]
            .split('\n      - ')[0],
        ],
        { env, encoding: 'utf8', timeout: 9000 }
      );
    expect(sh('Start ci-fast lanes').status).toBe(0);
    const awaited = sh('Await ci-fast lanes');
    rmSync(dir, { recursive: true, force: true });
    expect([awaited.status, awaited.stdout]).toEqual([3, 'lane-log\n']);
    expect(at('Setup Playwright (Chromium)')).toBeGreaterThan(
      at('- name: Start ci-fast lanes')
    );
    expect(at('- name: Await ci-fast lanes')).toBeGreaterThan(
      at('- name: Restore Symphony selector cache')
    );
    expect(at('- name: Run structural ci-fast lane')).toBeGreaterThan(
      at('- name: Await ci-fast lanes')
    );
    expect(remaining).toContain("CI_FAST_SKIP_STRUCTURAL: 'true'");
    expect(remaining).toContain("CI_FAST_ONLY_STRUCTURAL: 'true'");
    expect(remaining).toContain(
      "if: ${{ success() && steps.structural.outputs.skip != 'true' }}"
    );
  });

  it('retains successful structural evidence beyond the short artifact excerpt', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-evidence-'));
    try {
      const executable = join(repo, 'pnpm'),
        coverage = join(repo, 'coverage');
      writeFileSync(
        executable,
        '#!/bin/sh\nprintf "%s\\n" "CONTROL_EVIDENCE_BEGIN" "' +
          'x'.repeat(150_000) +
          '"\n'
      );
      chmodSync(executable, 0o700);
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            PATH: repo,
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            CI_PRODUCT_LANES: 'web',
            CI_FAST_LANE_GROUP: 'remaining',
            CI_FAST_ONLY_STRUCTURAL: 'true',
            CI_FAST_SKIP_STRUCTURAL: 'false',
            NODE_V8_COVERAGE: coverage,
            CI_FAST_LANES_OUT: join(repo, 'result.json'),
          },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('CONTROL_EVIDENCE_BEGIN');
      expect(result.stdout.endsWith('[ci-fast] all lanes passed\n')).toBe(true);
      const receipts = readdirSync(coverage).flatMap(
        name => JSON.parse(readFileSync(join(coverage, name), 'utf8')).result
      );
      const runner = receipts.find(item =>
        item.url.endsWith('/scripts/ci-fast-lanes.mjs')
      );
      expect(
        runner.functions.find(item => item.functionName === 'main').ranges[0]
          .count
      ).toBeGreaterThan(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('fail-fast runs every cheap lane but skips structural after a failure', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-fail-fast-'));
    const outPath = join(repo, 'ci-fast-lanes.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'remaining',
            CI_FAST_LANES_OUT: outPath,
            CI_FAST_SKIP_STRUCTURAL: 'false',
            CI_FAST_ONLY_STRUCTURAL: 'false',
            PATH: repo,
          },
        }
      );
      expect(result.status).not.toBe(0);
      const payload = JSON.parse(readFileSync(outPath, 'utf8'));
      const failed = payload.lanes.filter(lane => lane.status === 'failure');
      const skippedByFailFast = payload.lanes.filter(
        lane =>
          lane.status === 'skipped' &&
          String(lane.logExcerpt).includes('fail-fast')
      );
      // Every cheap lane reports in one cycle; only structural is spared.
      expect(failed.length).toBeGreaterThan(1);
      expect(skippedByFailFast.map(lane => lane.id)).toEqual(['structural']);
      expect(payload.lanes.at(-1).id).toBe('structural');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('runs actionlint from checksum-pinned binaries instead of a Docker action', () => {
    // A Docker action's image is built at job start even when its step is
    // skipped (~30s on the merge-queue critical path). The script pins the
    // exact toolchain the image shipped and must fail closed on any drift.
    const script = readFileSync(
      resolve(REPO_ROOT, '.github/scripts/run-actionlint.sh'),
      'utf8'
    );
    const workflowsDir = resolve(REPO_ROOT, '.github/workflows');
    for (const file of readdirSync(workflowsDir)) {
      if (!/\.ya?ml$/.test(file)) continue;
      expect(
        readFileSync(join(workflowsDir, file), 'utf8'),
        `${file} must not use the Docker actionlint action`
      ).not.toMatch(/uses:\s*rhysd\/actionlint/);
    }
    expect(
      readFileSync(resolve(workflowsDir, 'actionlint.yml'), 'utf8')
    ).toContain('run: bash .github/scripts/run-actionlint.sh');

    expect(script).toMatch(/^set -euo pipefail$/m);
    expect(script).toContain("readonly ACTIONLINT_VERSION='1.7.12'");
    expect(script).toContain("readonly SHELLCHECK_VERSION='0.11.0'");
    expect(script).toContain("readonly PYFLAKES_VERSION='3.4.0'");
    for (const name of [
      'ACTIONLINT_SHA256',
      'SHELLCHECK_TARBALL_SHA256',
      'SHELLCHECK_BINARY_SHA256',
      'PYFLAKES_WHEEL_SHA256',
    ]) {
      expect(script).toMatch(
        new RegExp(`^readonly ${name}='[0-9a-f]{64}'$`, 'm')
      );
    }
    expect(script.match(/sha256sum --check --status/g)?.length).toBe(2);
    expect(script).toContain('--fail');
    expect(script).toContain('-shellcheck="$tool_dir/shellcheck"');
    expect(script).toContain('-pyflakes="$tool_dir/pyflakes"');
  });

  it('keeps structural setup out of typecheck and fails closed in the aggregate', () => {
    const typecheck = jobBlock('ci-fast-typecheck', 'ci-fast-remaining');
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const aggregate = jobBlock('ci-fast', 'ci-promptfoo-evals');

    expect(typecheck).not.toMatch(
      /run-actionlint\.sh|rhysd\/actionlint|actions\/setup-python|python -m pip install/
    );
    expect(remaining).toMatch(
      /- name: Run actionlint \(structural\)\n\s+if: \$\{\{ success\(\) && steps\.structural\.outputs\.skip != 'true' \}\}\n\s+run: bash \.github\/scripts\/run-actionlint\.sh\n/
    );
    expect(remaining).toMatch(/actions\/setup-python/);
    expect(remaining).toMatch(/python -m pip install/);
    expect(typecheck).not.toContain('ci-fast-remaining');
    expect(remaining).not.toContain('ci-fast-typecheck');

    expect(aggregate).toMatch(
      /needs:\s*\[\s*ci-path-changes,\s*ci-merge-group-admission,\s*ci-fast-typecheck,\s*ci-fast-remaining,\s*ci-profile-admission-browser,\s*ci-fast-structural-python,\s*\]/s
    );
    expect(aggregate).toMatch(/^  ci-fast:\n    name: ci-fast$/m);
    expect(aggregate).toMatch(/if: >-\s+always\(\)/);
    expect(aggregate).toMatch(/needs\.ci-path-changes\.result == 'success'/);
    expect(aggregate).toMatch(/github\.event_name != 'merge_group'/);
    expect(aggregate).toMatch(
      /needs\.ci-merge-group-admission\.result == 'success'/
    );
    expect(aggregate).toMatch(
      /TYPECHECK_RESULT: \$\{\{ needs\.ci-fast-typecheck\.result \}\}/
    );
    expect(aggregate).toMatch(
      /REMAINING_RESULT: \$\{\{ needs\.ci-fast-remaining\.result \}\}/
    );
    expect(aggregate).toMatch(
      /PROFILE_BROWSER_RESULT: \$\{\{ needs\.ci-profile-admission-browser\.result \}\}/
    );
    expect(aggregate).toMatch(
      /\[\[ "\$TYPECHECK_RESULT" != "success" \|\| "\$REMAINING_RESULT" != "success" \|\| "\$PROFILE_BROWSER_RESULT" != "success" \|\| "\$STRUCTURAL_PYTHON_RESULT" != "success" \]\]/
    );
    expect(aggregate).not.toContain('GROUP_RESULT');
    expect(aggregate).toMatch(/exit 1/);
  });

  it('runs the structural pytest shards in an aliased ci-fast job', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const python = jobBlock('ci-fast-structural-python', 'ci-knip');
    const aliases = python.match(/(?<= \*)[\w-]+/g);
    expect(aliases).toHaveLength(10);
    for (const name of aliases) expect(remaining).toContain(`&${name}`);
    expect(remaining).toContain('CI_FAST_STRUCTURAL_PYTEST: skip');
    expect(python).toContain('CI_FAST_STRUCTURAL_PYTEST: only');
  });

  it('runs a bounded public-profile admission subset on source and merge-group heads', () => {
    expect(LANE_GROUPS.remaining).toContain('profile-admission');
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/api/profile/capture-dismissal.test.ts'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'lib/profile/capture-dismissal-client.test.ts'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'components/features/release/SmartLinkProviderButton.test.tsx'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/api/profile/pac-event.test.ts'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/cookie-banner-fixes.test.tsx'
    );
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'tests/unit/profile/ProfileHomeRail.test.tsx'
    );
    for (const testFile of [
      'components/features/profile/templates/PublicProfileLayoutShell.test.tsx',
      'components/features/profile/templates/ProfileDesktopSurface.test.tsx',
      'tests/unit/profile/profile-compact-template.test.tsx',
    ]) {
      expect(LANE_COMMANDS['profile-admission']).toContain(testFile);
    }
    expect(LANE_COMMANDS['profile-admission']).toContain('--coverage');
    expect(LANE_COMMANDS['profile-admission']).toContain(
      'components/features/profile/templates/{PublicProfileLayoutShell,ProfileDesktopSurface,ProfileCompactTemplate}.tsx'
    );
    expect(CI_FAST_SOURCE).toContain(
      ':(glob)apps/web/app/\\\\[username\\\\]/**'
    );
    expect(CI_FAST_SOURCE).not.toContain("'apps/web/app/[username]/**'");

    const browser = jobBlock('ci-profile-admission-browser', 'ci-fast');
    expect(browser).toContain('tests/e2e/profile-admission.spec.ts');
    expect(browser).toContain('--config=playwright.config.noauth.ts');
    expect(browser).toContain('--project=chromium');
    expect(browser).toContain(
      'apps/web/tests/e2e/utils/public-profile-layout-invariant.ts'
    );
    expect(browser).toContain(
      'apps/web/tests/e2e/utils/profile-admission-diagnostics.test.mjs'
    );
    expect(browser).toMatch(/github\.event_name.*merge_group/);
    expect(browser).toMatch(/github\.event_name.*pull_request/);
    expect(browser).toContain('git diff --diff-filter=ACDMRT --name-only');
    expect(browser).toContain(':(glob)apps/web/app/\\[username\\]/**');
    // Workflow-only changes are covered by the deterministic CI contract
    // suite. They must not boot a public-profile runtime server and browser
    // unless a profile surface or its selector changed.
    expect(browser).not.toContain("'.github/workflows/ci.yml'");
    expect(browser).not.toContain("'scripts/ci-fast-lanes.mjs'");
    expect(CI_FAST_SOURCE).not.toContain("    '.github/workflows/ci.yml',");
    const selectIdx = browser.indexOf('id: profile-browser');
    const installIdx = browser.indexOf(
      'uses: ./.github/actions/setup-node-pnpm'
    );
    expect(selectIdx).toBeGreaterThan(0);
    expect(installIdx).toBeGreaterThan(selectIdx);
    expect(browser).toMatch(
      /uses: \.\/\.github\/actions\/setup-node-pnpm\n\s+if: steps\.profile-browser\.outputs\.run == 'true'/
    );
    for (const requiredPath of [
      'apps/web/app/(marketing)/renders/profile-admission/**',
      'apps/web/components/features/release/SmartLinkProviderButton.tsx',
      'apps/web/components/organisms/CookieBannerMount.tsx',
      'apps/web/components/organisms/CookieBannerSection.tsx',
      'apps/web/lib/cookies/**',
      'apps/web/lib/tracking/pac-**',
      'apps/web/styles/design-system.css',
    ]) {
      expect(browser).toContain(requiredPath);
      expect(CI_FAST_SOURCE).toContain(requiredPath);
    }
  });

  it('keeps deleted files in public-profile admission selection', () => {
    expect(CI_FAST_SOURCE).toContain(
      'git diff --diff-filter=ACDMRT --name-only'
    );
    expect(CI_FAST_SOURCE).not.toContain(
      'git diff --diff-filter=d --name-only'
    );
    const browser = jobBlock('ci-profile-admission-browser', 'ci-fast');
    expect(browser).toContain('git diff --diff-filter=ACDMRT --name-only');
  });

  it('path-selects both workflow contracts and excludes unrelated tests', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const controlPattern = remaining.match(
      /STRUCTURAL_CONTROL_PATTERN='([^']+)'/
    )?.[1];
    const controlPatternAdditions = Array.from(
      remaining.matchAll(/STRUCTURAL_CONTROL_PATTERN\+='([^']+)'/g),
      match => match[1]
    );
    const uiPattern = remaining.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(controlPattern).toBeDefined();
    expect(uiPattern).toBeDefined();

    const selectsStructural = new RegExp(
      [
        controlPattern,
        ...controlPatternAdditions.map(addition => addition.replace(/^\|/, '')),
        uiPattern,
      ].join('|')
    );
    expect(
      selectsStructural.test(
        'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs'
      )
    ).toBe(true);
    expect(
      selectsStructural.test(
        'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs'
      )
    ).toBe(true);
    expect(
      selectsStructural.test('scripts/verification/admission-shadow.mjs')
    ).toBe(true);
    for (const fxCoveragePath of [
      'scripts/lib/fx-remediation-lane.mjs',
      'scripts/lib/rolling-ci-dispatch.mjs',
      'scripts/lib/rolling-ci-fx.mjs',
      'scripts/lib/rolling-ci-fx-finish.mjs',
      'scripts/lib/__tests__/fx-remediation-lane.test.mjs',
      'scripts/lib/__tests__/rolling-ci-dispatch.test.mjs',
      'scripts/lib/__tests__/rolling-ci-fx.test.mjs',
      'scripts/lib/__tests__/rolling-ci-fx-finish.test.mjs',
    ]) {
      expect(selectsStructural.test(fxCoveragePath)).toBe(true);
    }
    for (const mergeQueueControllerPath of [
      'scripts/automation-verify.sh',
      'scripts/run-affected-tests.mjs',
      'scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs',
      'scripts/drain-pr-queue.sh',
      'scripts/drain-pr-remediate.mjs',
      'scripts/merge-queue-backend.mjs',
      'scripts/ownerless-recovery-sweeper.mjs',
      'scripts/lib/ownerless-recovery-policy.mjs',
      'scripts/lib/pr-check-failures.mjs',
      'scripts/lib/pre-land-changelog.mjs',
      'scripts/lib/resolve-merge-group-path-diff.mjs',
      'scripts/lib/upsert-pr-comment.sh',
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/lib/__tests__/merge-queue-backend.test.mjs',
      'scripts/lib/__tests__/merge-queue-guard.test.mjs',
      'scripts/lib/__tests__/ownerless-recovery-policy.test.mjs',
      'scripts/lib/__tests__/pre-land-changelog.test.mjs',
      'scripts/lib/__tests__/pr-check-failures.test.mjs',
      'scripts/tests/test_gh_retry.py',
      'scripts/tests/test_runner_routing.py',
      'scripts/tests/test_symphony_ui_pilot_runtime.py',
      'scripts/tests/test_symphony_reconciler_runtime.py',
      'scripts/symphony/closure_health.py',
      'scripts/symphony/control-bundle-manifest.mjs',
      'scripts/symphony/config/gem-repo-registry.json',
      'scripts/symphony/config/model-registry.json',
      'scripts/symphony/evaluate-fleet-gate.sh',
      'scripts/symphony/fleet_admission_receipt.py',
      'scripts/symphony/gem-disk-reclaim.py',
      'scripts/symphony/gem-workspace-migrate.py',
      'scripts/symphony/install-gem-symphony-storage.sh',
      'scripts/symphony/jovie-symphony-workspace',
      'scripts/symphony/install-gem-fleet-controller.sh',
      'scripts/symphony/install-symphony-ui-pilot.sh',
      'scripts/symphony/model-router.py',
      'scripts/symphony/symphony-nvme-package-cache.sh',
      'scripts/symphony/symphony-reconciler.py',
      'scripts/symphony/summer-symphony-outbox-consumer.mjs',
      'scripts/symphony/summer-symphony-outbox-contract.test.mjs',
      'scripts/symphony/summer-symphony-outbox-consumer.test.mjs',
      'scripts/symphony/summer-shipping-lead-contract.mjs',
      'scripts/symphony/summer-shipping-lead-contract.test.mjs',
      'scripts/symphony/native-queue-starvation-execute.test.mjs',
      'scripts/symphony/systemd/gem-disk-reclaim.service',
      'scripts/symphony/systemd/gem-disk-reclaim.timer',
      'scripts/symphony/systemd/gem-pr-drain.service',
      'scripts/symphony/systemd/gem-pr-drain.timer',
      'scripts/symphony/tests/closure-health.test.py',
      'scripts/symphony/tests/control-bundle-manifest.test.mjs',
      'scripts/symphony/tests/gem-pr-drain.test.py',
      'scripts/symphony/tests/gem-ops-hud.test.py',
      'scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
      'scripts/symphony/tests/gem-priority-gate.test.py',
      'scripts/symphony/tests/gem-rehabilitation-policy.test.py',
      'scripts/symphony/tests/symphony-nvme-package-cache.test.py',
      'scripts/symphony/tests/symphony-reconciler.test.py',
      'scripts/symphony/tests/test_gem_disk_reclaim.py',
      'scripts/symphony/tests/jovie-symphony-workspace.test.py',
      'scripts/symphony/tests/test_gem_workspace_migrate.py',
      'scripts/symphony/tests/test-model-router.py',
      'scripts/symphony/tests/test_evaluate_fleet_gate.py',
      'scripts/symphony/tests/test_fleet_admission_receipt.py',
    ]) {
      expect(selectsStructural.test(mergeQueueControllerPath)).toBe(true);
      expect(
        spawnSync('grep', ['-Eq', selectsStructural.source], {
          input: mergeQueueControllerPath + '\n',
        }).status
      ).toBe(0);
    }
    expect(selectsStructural.test('.github/workflows/ci.yml')).toBe(true);
    expect(selectsStructural.test('.claude/rules/ci-branching.md')).toBe(true);
    expect(CI_FAST_SOURCE).toContain(
      "--test-coverage-include='scripts/verification/*.mjs'"
    );
    expect(CI_FAST_SOURCE).toContain('--test-coverage-branches=98');
    expect(selectsStructural.test('apps/web/components/atoms/Button.tsx')).toBe(
      true
    );
    expect(selectsStructural.test('apps/web/app/(home)/page.tsx')).toBe(true);
    expect(selectsStructural.test('packages/ui/atoms/badge.tsx')).toBe(true);
    expect(selectsStructural.test('scripts/component-ship-gate.mjs')).toBe(
      true
    );
    expect(
      selectsStructural.test('apps/web/tests/unit/atoms/ViaPanel.test.tsx')
    ).toBe(true);
    expect(
      new RegExp(uiPattern).test('apps/web/tests/unit/atoms/ViaPanel.test.tsx')
    ).toBe(true);
    expect(
      new RegExp(uiPattern).test('apps/web/components/atoms/Button.test.tsx')
    ).toBe(true);
    expect(new RegExp(uiPattern).test('packages/ui/atoms/badge.test.tsx')).toBe(
      true
    );
    for (const receiptRepairPath of [
      'apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx',
      'apps/web/tests/unit/marketing/component-registry.test.ts',
      'apps/web/tests/unit/marketing/support-route-header-contract.test.ts',
      'apps/web/tests/e2e/utils/public-surface-manifest.ts',
    ]) {
      expect(selectsStructural.test(receiptRepairPath)).toBe(true);
    }
    // These paths feed the live rendered component harness, not just the
    // shadow UI-story audit; a harness change must not skip runStructural.
    for (const storybookHarnessPath of [
      'apps/web/.storybook/main.ts',
      'apps/web/.storybook/preview.tsx',
      'apps/web/.storybook/stories/elevation-matrix.stories.tsx',
      'chromatic.config.json',
    ]) {
      expect(selectsStructural.test(storybookHarnessPath)).toBe(true);
    }
    for (const tokenAuditPath of [
      'scripts/shared-ui-visual-arbitrary-audit.mjs',
      'scripts/shared-ui-visual-arbitrary-audit.test.mjs',
      'scripts/shared-ui-visual-arbitrary.baseline.json',
    ]) {
      expect(selectsStructural.test(tokenAuditPath)).toBe(true);
    }
    for (const directStructuralInput of [
      'package.json',
      'apps/web/package.json',
      'apps/web/scripts/check-reliability-detectors.ts',
      'apps/web/scripts/lint-contrast-ratchet.mjs',
      'apps/web/scripts/lint-no-native-dialogs.mjs',
      'apps/web/scripts/next-proxy-guard.mjs',
      'apps/web/scripts/seo-ratchet-guard.mjs',
      'apps/web/scripts/tailwind-guard.mjs',
      'scripts/doc-freshness-lint.mjs',
    ]) {
      expect(selectsStructural.test(directStructuralInput)).toBe(true);
    }
    for (const nonUiPath of [
      'apps/web/app/api/health/deploy/route.ts',
      'apps/web/data/designSystem/componentRegistry.ts',
      'apps/web/lib/queries/useDashboardProfileQuery.ts',
      'apps/web/scripts/test-performance-guard.ts',
      'docs/design-system/design-conformance-manifest.json',
      'docs/product/README.md',
      'apps/web/storybook/main.ts',
      'chromatic.config.json.bak',
      'apps/web/tests-not-centralized/unit/foo.test.ts',
    ]) {
      expect(selectsStructural.test(nonUiPath)).toBe(false);
    }
    expect(selectsStructural.test('.claude/skills/qa/SKILL.md')).toBe(false);
    expect(selectsStructural.test('.claude/rules/auth.md')).toBe(false);
  });

  it('runs hosted structural CI for Storybook, Chromatic, and token-guard inputs', () => {
    const remaining = jobBlock(
      'ci-fast-remaining',
      'ci-profile-admission-browser'
    );
    const structuralDecision = remaining.slice(
      remaining.indexOf('- name: Decide structural lane'),
      remaining.indexOf('- name: Run actionlint (structural)')
    );
    const controlPattern = remaining.match(
      /STRUCTURAL_CONTROL_PATTERN='([^']+)'/
    )?.[1];
    const uiPattern = remaining.match(/STRUCTURAL_UI_PATTERN='([^']+)'/)?.[1];
    expect(controlPattern).toBeDefined();
    expect(uiPattern).toBeDefined();
    const selectsStructural = new RegExp(`${controlPattern}|${uiPattern}`);
    const uiRe = new RegExp(uiPattern);

    // Source PRs path-gate the remaining structural lane; merge groups never skip.
    expect(structuralDecision).toContain(
      'github.event_name }}" != "pull_request"'
    );
    expect(structuralDecision).toContain('echo "skip=false"');
    expect(remaining).toMatch(/github\.event_name != 'merge_group'/);
    expect(remaining).toMatch(
      /needs\.ci-merge-group-admission\.result == 'success'/
    );

    // Direct rendered-harness and token-guard inputs must select structural.
    expect(uiRe.test('apps/web/.storybook/main.ts')).toBe(true);
    expect(uiRe.test('apps/web/.storybook/preview.tsx')).toBe(true);
    expect(
      uiRe.test('apps/web/.storybook/stories/elevation-matrix.stories.tsx')
    ).toBe(true);
    expect(uiRe.test('chromatic.config.json')).toBe(true);
    expect(uiRe.test('scripts/shared-ui-visual-arbitrary-audit.mjs')).toBe(
      true
    );
    expect(uiRe.test('scripts/shared-ui-visual-arbitrary-audit.test.mjs')).toBe(
      true
    );
    expect(uiRe.test('scripts/shared-ui-visual-arbitrary.baseline.json')).toBe(
      true
    );
    expect(uiRe.test('package.json')).toBe(true);
    expect(uiRe.test('apps/web/package.json')).toBe(true);
    expect(uiRe.test('apps/web/scripts/check-reliability-detectors.ts')).toBe(
      true
    );
    expect(uiRe.test('apps/web/scripts/lint-contrast-ratchet.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/lint-no-native-dialogs.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/next-proxy-guard.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/seo-ratchet-guard.mjs')).toBe(true);
    expect(uiRe.test('apps/web/scripts/tailwind-guard.mjs')).toBe(true);
    expect(selectsStructural.test('scripts/doc-freshness-lint.mjs')).toBe(true);
    expect(
      spawnSync('grep', ['-qE', controlPattern], {
        input: 'apps/web/scripts/optical-grid-scanners.ts\n',
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const scannerCoverage = CI_FAST_SOURCE.slice(
      CI_FAST_SOURCE.indexOf('const webParts = ['),
      CI_FAST_SOURCE.indexOf('const macParts = [')
    );
    expect(scannerCoverage).toContain(
      '--coverage.include=scripts/optical-grid-scanners.ts'
    );
    expect(scannerCoverage).toContain(
      'tests/unit/design-system/spacing-scale-ratchet.test.ts'
    );
    expect(scannerCoverage).toContain(
      'tests/unit/design-system/concentric-radius-contract.test.ts'
    );

    // JOV-5435 centralized web-test boundary stays selected.
    expect(uiRe.test('apps/web/tests/unit/atoms/ViaPanel.test.tsx')).toBe(true);
    expect(uiRe.test('apps/web/tests/e2e/smoke-public.spec.ts')).toBe(true);

    // Similar-looking non-inputs must remain excluded.
    expect(uiRe.test('apps/web/storybook/main.ts')).toBe(false);
    expect(uiRe.test('.storybook/main.ts')).toBe(false);
    expect(uiRe.test('apps/desktop/.storybook/preview.tsx')).toBe(false);
    expect(uiRe.test('apps/web/chromatic.config.json')).toBe(false);
    expect(uiRe.test('chromatic.config.js')).toBe(false);
    expect(uiRe.test('docs/chromatic.config.json')).toBe(false);
    expect(uiRe.test('scripts/shared-ui-visual.mjs')).toBe(false);
    expect(uiRe.test('scripts/lib/shared-ui-visual-arbitrary-audit.mjs')).toBe(
      false
    );
    expect(
      uiRe.test('apps/web/scripts/shared-ui-visual-arbitrary-audit.mjs')
    ).toBe(false);
    expect(uiRe.test('apps/web/scripts/test-performance-guard.ts')).toBe(false);
    expect(uiRe.test('apps/web/lib/env.ts')).toBe(false);
  });

  it('skips the aggregate when the original ci-fast eligibility is skipped', () => {
    const aggregate = jobBlock('ci-fast', 'ci-promptfoo-evals');
    const isEligible = ({ pathResult, eventName, admissionResult }) =>
      pathResult === 'success' &&
      (eventName !== 'merge_group' || admissionResult === 'success');
    const aggregateResult = ({
      pathResult,
      eventName,
      admissionResult,
      groupResult,
    }) =>
      !isEligible({ pathResult, eventName, admissionResult })
        ? 'skipped'
        : groupResult === 'success'
          ? 'success'
          : 'failure';

    expect(
      aggregateResult({
        pathResult: 'skipped',
        eventName: 'push',
        admissionResult: 'skipped',
        groupResult: 'skipped',
      })
    ).toBe('skipped');
    expect(
      aggregateResult({
        pathResult: 'success',
        eventName: 'merge_group',
        admissionResult: 'failure',
        groupResult: 'skipped',
      })
    ).toBe('skipped');
    expect(
      aggregateResult({
        pathResult: 'success',
        eventName: 'merge_group',
        admissionResult: 'success',
        groupResult: 'failure',
      })
    ).toBe('failure');
    expect(aggregate).not.toMatch(
      /needs\.ci-fast-typecheck\.result == 'success'/
    );
    expect(aggregate).not.toMatch(
      /needs\.ci-fast-remaining\.result == 'success'/
    );
  });

  it('keeps downstream requirements on the ci-fast job id', () => {
    const releaseReady = jobBlock('main-release-ready');

    expect(releaseReady).toMatch(/\n\s+ci-fast,/);
    expect(releaseReady).toMatch(
      /FAST_RESULT="\$\{\{ needs\.ci-fast\.result \}\}"/
    );
    expect(WORKFLOW).toContain('name: ci-fast');
  });
});

it('runs the pinned Symphony selector for governor-bounded-codex intake edits', () => {
  const remaining = jobBlock(
    'ci-fast-remaining',
    'ci-profile-admission-browser'
  );
  const pattern = [
    ...remaining.matchAll(/STRUCTURAL_CONTROL_PATTERN\+?='([^']+)'/g),
  ]
    .map(match => match[1])
    .join('');
  for (const path of [
    'scripts/symphony/tests/run-governor-bounded-codex-selector.sh',
    'scripts/symphony/tests/governor_bounded_codex_intake_test.exs',
  ]) {
    const selected = spawnSync('grep', ['-qE', pattern], {
      input: `${path}\n`,
    });
    expect(selected.status, path).toBe(0);
  }
  expect(CI_FAST_SOURCE).toContain(
    'bash scripts/symphony/tests/run-governor-bounded-codex-selector.sh'
  );
});

it('runs the attestation observation coverage gate for publisher-only edits', () => {
  const pattern = WORKFLOW.match(/STRUCTURAL_CONTROL_PATTERN='([^']+)'/)[1];
  const selected = new RegExp(pattern);
  expect(
    selected.test('scripts/symphony/emit_gem_service_attestation.py')
  ).toBe(true);
  expect(
    selected.test('scripts/symphony/tests/gem-service-attestation.test.py')
  ).toBe(true);
  expect(CI_FAST_SOURCE).toContain(
    'coverage run --branch scripts/symphony/tests/gem-service-attestation.test.py'
  );
  expect(CI_FAST_SOURCE).toContain(
    'emit_gem_service_attestation.py" --show-missing --precision=2 --fail-under=90'
  );
  expect(
    selected.test('scripts/symphony/install-gem-service-attestation.sh')
  ).toBe(true);
  expect(
    selected.test('scripts/symphony/systemd/gem-service-attestation.service')
  ).toBe(true);
});

it('runs authenticated Summer bridge coverage for admission-only edits', () => {
  const pattern = WORKFLOW.match(/STRUCTURAL_CONTROL_PATTERN='([^']+)'/)[1];
  const selected = new RegExp(pattern);
  expect(selected.test('apps/web/lib/ovie/summer-admissions.ts')).toBe(true);
  expect(
    selected.test('apps/web/app/api/internal/ovie/summer-bottleneck/route.ts')
  ).toBe(true);
  expect(CI_FAST_SOURCE).toContain(
    'app/api/internal/ovie/summer-bottleneck/route.test.ts --coverage'
  );
  expect(CI_FAST_SOURCE).toContain(
    '--coverage.include=lib/ovie/summer-admissions.ts'
  );
});

describe('invariant-scanned PR structural selection', () => {
  // #18182 changed apps/desktop/src/main.ts (JOV-INV-031 scope) without any
  // invariant run; PR structural selection must derive from the scan roots.
  it('selects structural for every invariant-scanned path on source PRs', () => {
    const addition =
      'STRUCTURAL_CONTROL_PATTERN+="|$(node scripts/invariants/scanned-paths.mjs --ere)"';
    const decision = WORKFLOW.slice(
      WORKFLOW.indexOf('- name: Decide structural lane'),
      WORKFLOW.indexOf('- name: Select Storybook browser proof')
    );
    expect(decision).toContain(addition);
    expect(decision.indexOf(addition)).toBeLessThan(
      decision.indexOf('|| git diff --name-only')
    );

    const ere = execFileSync(
      process.execPath,
      [resolve(REPO_ROOT, 'scripts/invariants/scanned-paths.mjs'), '--ere'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    const selects = path =>
      spawnSync('grep', ['-qE', ere], { input: `${path}\n` }).status === 0;
    for (const path of [
      'apps/desktop/src/main.ts',
      'apps/web/lib/chat/knowledge/topics.ts',
      'apps/web/app/[username]/page.tsx',
      'scripts/invariants/latency-sensitive-execution-allowlist.json',
    ]) {
      expect(selects(path), path).toBe(true);
    }
    for (const path of [
      'apps/desktop/src-other/main.ts',
      'apps/web/tests/e2e/public-profile-smoke.spec.ts',
    ]) {
      expect(selects(path), path).toBe(false);
    }
  });
});

describe('new scripts test PR structural selection', () => {
  // #18714 added an unwired scripts test; only the merge queue ran the
  // inventory guard, so the PR passed and the queue group was ejected.
  it('selects structural when a PR adds or renames a scripts test', () => {
    const decision = WORKFLOW.slice(
      WORKFLOW.indexOf('- name: Decide structural lane'),
      WORKFLOW.indexOf('- name: Select Storybook browser proof')
    );
    const line = decision
      .split('\n')
      .find(l => l.includes('NEW_SCRIPT_TESTS=$('));
    expect(line).toContain('git diff --diff-filter=AR --name-only');
    expect(decision).toContain('if [ -n "$NEW_SCRIPT_TESTS" ] ||');
    const ere = line.match(/grep -E '([^']+)'/)[1];
    const selects = path =>
      spawnSync('grep', ['-qE', ere], { input: `${path}\n` }).status === 0;
    expect(selects('scripts/ops/firecrawl-crawl.test.mjs')).toBe(true);
    expect(selects('scripts/symphony/lib/__tests__/typed.test.ts')).toBe(true);
    expect(selects('scripts/ops/firecrawl-crawl.mjs')).toBe(false);
    expect(selects('apps/web/tests/unit/a.test.ts')).toBe(false);
  });
});

describe('CI diff selection on a divergent PR', () => {
  it('ignores main-only changes for PRs while preserving exact combined-head and push diffs', () => {
    const repository = mkdtempSync(join(tmpdir(), 'ci-pr-diff-'));
    const git = (...args) =>
      execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
    const select = (event, base = '') => {
      vi.stubEnv('GITHUB_EVENT_NAME', event);
      vi.stubEnv('GITHUB_BASE_REF', 'main');
      vi.stubEnv('TURBO_SCM_BASE', base);
      return {
        all: listAllChangedFiles(repository),
        ts: changedFiles(['*.ts'], repository),
      };
    };
    try {
      git('init', '-b', 'main');
      git('config', 'user.name', 'CI test');
      git('config', 'user.email', 'ci-test@example.invalid');
      writeFileSync(join(repository, 'shared.ts'), 'export const value = 1;\n');
      git('add', '.');
      git('commit', '-m', 'base');
      const base = git('rev-parse', 'HEAD');
      writeFileSync(
        join(repository, 'main-only.ts'),
        'export const onlyMain = true;\n'
      );
      git('add', '.');
      git('commit', '-m', 'main moves ahead');
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      git('checkout', '-b', 'pr', base);
      writeFileSync(
        join(repository, 'pr-only.ts'),
        'export const onlyPr = true;\n'
      );
      writeFileSync(join(repository, 'notes.md'), 'PR note\n');
      git('add', '.');
      git('commit', '-m', 'PR change');
      expect(select('pull_request')).toEqual({
        all: ['notes.md', 'pr-only.ts'],
        ts: ['pr-only.ts'],
      });
      expect(select('merge_group', 'origin/main')).toEqual({
        all: ['main-only.ts', 'notes.md', 'pr-only.ts'],
        ts: ['main-only.ts', 'pr-only.ts'],
      });
      expect(select('push')).toEqual({
        all: ['notes.md', 'pr-only.ts'],
        ts: ['pr-only.ts'],
      });
      git('update-ref', '-d', 'refs/remotes/origin/main');
      expect(select('pull_request', base)).toEqual({
        all: ['notes.md', 'pr-only.ts'],
        ts: ['pr-only.ts'],
      });
      expect(select('pull_request', 'missing-base')).toEqual({
        all: null,
        ts: null,
      });
    } finally {
      vi.unstubAllEnvs();
      rmSync(repository, { recursive: true, force: true });
    }
  });
});

it('selects and enforces offline failure behavior coverage for module-only and test-only edits', () => {
  const pattern = WORKFLOW.match(/STRUCTURAL_CONTROL_PATTERN='([^']+)'/)?.[1];
  expect(pattern).toBeDefined();
  for (const path of [
    'scripts/lib/rolling-ci-failure-disposition.mjs',
    'scripts/lib/__tests__/rolling-ci-failure-disposition.test.mjs',
  ]) {
    expect(
      spawnSync('grep', ['-qE', pattern], { input: `${path}\n` }).status,
      path
    ).toBe(0);
  }
  expect(
    spawnSync('grep', ['-qE', pattern], {
      input: 'scripts/lib/rolling-ci-failure-disposition.mjs.unrelated\n',
    }).status
  ).toBe(1);
  expect(LANE_COMMANDS.structural).toContain(OFFLINE_FAILURE_COVERAGE_COMMAND);
  expect(
    CI_FAST_SOURCE.slice(
      CI_FAST_SOURCE.indexOf('const operationsParts = ['),
      CI_FAST_SOURCE.indexOf('const webParts = [')
    )
  ).toContain('OFFLINE_FAILURE_COVERAGE_COMMAND');
  expect(OFFLINE_FAILURE_COVERAGE_COMMAND).toContain(
    'lib/__tests__/rolling-ci-failure-disposition.test.mjs'
  );
  expect(OFFLINE_FAILURE_COVERAGE_COMMAND).toContain(
    '--coverage.include="$PWD/scripts/lib/rolling-ci-failure-disposition.mjs"'
  );
  for (const metric of [
    'lines=100',
    'statements=100',
    'functions=100',
    'branches=95',
    'perFile=true',
  ]) {
    expect(OFFLINE_FAILURE_COVERAGE_COMMAND).toContain(
      `--coverage.thresholds.${metric}`
    );
  }
});

describe('Symphony selector toolchain cache', () => {
  const SELECTOR =
    'scripts/symphony/tests/run-governor-bounded-codex-selector.sh';
  const CACHE_PATHS = [
    '${{ runner.temp }}/symphony-selector-beam',
    '${{ runner.temp }}/symphony-selector-mix-home',
    '${{ runner.temp }}/symphony-selector-src/elixir/deps',
    '${{ runner.temp }}/symphony-selector-src/elixir/_build/test',
  ];
  const SELECTOR_ENV = [
    'SYMPHONY_ELIXIR_PREFIX: ${{ runner.temp }}/symphony-selector-beam',
    'MIX_HOME: ${{ runner.temp }}/symphony-selector-mix-home/mix',
    'HEX_HOME: ${{ runner.temp }}/symphony-selector-mix-home/hex',
  ];
  const remaining = () =>
    jobBlock('ci-fast-remaining', 'ci-profile-admission-browser');

  function step(block, name) {
    const start = block.indexOf(`      - name: ${name}\n`);
    expect(start, `missing step ${name}`).toBeGreaterThanOrEqual(0);
    const next = block.indexOf('\n      - name: ', start + 1);
    return block.slice(start, next === -1 ? block.length : next);
  }

  function printCacheKey() {
    const out = execFileSync('bash', [SELECTOR, '--print-cache-key'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return Object.fromEntries(
      out
        .trim()
        .split('\n')
        .map(line => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1),
        ])
    );
  }

  it('restores an exact key built from the pin, BEAM versions, platform and script hash', () => {
    const block = remaining();
    expect(step(block, 'Resolve Symphony selector cache key')).toContain(
      `bash ${SELECTOR} --print-cache-key >> "$GITHUB_OUTPUT"`
    );
    const restore = step(block, 'Restore Symphony selector cache');
    expect(restore).toContain(
      'uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0'
    );
    for (const output of ['platform', 'otp', 'elixir', 'pin']) {
      expect(restore).toContain(
        `\${{ steps.selector-cache-key.outputs.${output} }}`
      );
    }
    expect(restore).toContain('${{ runner.os }}');
    expect(restore).toContain(`\${{ hashFiles('${SELECTOR}') }}`);
    // Exact key only: another pin or toolchain must never seed build outputs.
    expect(restore).not.toContain('restore-keys');
    for (const path of CACHE_PATHS) expect(restore).toContain(path);

    const key = printCacheKey();
    const runtime = readFileSync(
      resolve(REPO_ROOT, 'scripts/symphony/symphony_official_runtime.py'),
      'utf8'
    );
    expect(key.pin).toBe(
      runtime.match(/OFFICIAL_SYMPHONY_GIT_SHA = "([0-9a-f]{40})"/)?.[1]
    );
    expect(key.otp).toMatch(/^\d+\.\d+\.\d+$/);
    expect(key.elixir).toMatch(/^\d+\.\d+\.\d+$/);
    expect(key.platform).toMatch(/^[a-z]+-[\d.]+-\w+$/);
  });

  it('points the selector at the cached paths and never saves from ci-fast', () => {
    const block = remaining();
    const keyAt = block.indexOf('- name: Resolve Symphony selector cache key');
    const restoreAt = block.indexOf('- name: Restore Symphony selector cache');
    const laneAt = block.indexOf('- name: Run structural ci-fast lane');
    expect(keyAt).toBeGreaterThan(0);
    expect(restoreAt).toBeGreaterThan(keyAt);
    expect(laneAt).toBeGreaterThan(restoreAt);

    const lane = step(block, 'Run structural ci-fast lane');
    for (const env of SELECTOR_ENV) expect(lane).toContain(env);
    // Overriding the checkout would skip the pinned clone entirely.
    expect(block).not.toContain('SYMPHONY_SELECTOR_CHECKOUT');
    expect(readFileSync(resolve(REPO_ROOT, SELECTOR), 'utf8')).toContain(
      'CHECKOUT="${RUNNER_TEMP:-/tmp}/symphony-selector-src"'
    );

    // Queue-proven main pushes skip ci-fast (remaining), so a save here could
    // never run. PR and merge-group runs only restore main's entry.
    expect(block).not.toContain('actions/cache/save@');
    expect(block).not.toContain('Save Symphony selector cache');
  });

  it('writes the selector cache only from a trusted-main warmer with the identical key', () => {
    const warm = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/symphony-selector-cache-warm.yml'),
      'utf8'
    );
    const header = warm.slice(0, warm.indexOf('\njobs:'));
    expect(header).toMatch(
      /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n\npermissions:\n {2}contents: read\n/m
    );
    for (const trigger of [
      'pull_request',
      'pull_request_target',
      'merge_group',
      'workflow_run',
      'schedule',
    ]) {
      expect(header).not.toMatch(new RegExp(`^\\s+${trigger}:`, 'm'));
    }
    expect(warm).not.toContain('secrets.');
    expect(warm).toContain('persist-credentials: false');
    expect(warm).toContain('runs-on: ubuntu-latest');
    expect(warm).toContain("github.ref == 'refs/heads/main' &&");
    expect(warm).toContain(
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')"
    );

    // Byte-identical key and paths to the ci-fast restore.
    const keyLine = block =>
      block
        .split('\n')
        .find(line => line.trim().startsWith('key: symphony-selector-v1-'))
        ?.trim();
    const ciRestore = step(remaining(), 'Restore Symphony selector cache');
    const lookup = step(warm, 'Look up Symphony selector cache');
    expect(keyLine(ciRestore)).toBeDefined();
    expect(keyLine(lookup)).toBe(keyLine(ciRestore));
    expect(step(warm, 'Resolve Symphony selector cache key')).toContain(
      `bash ${SELECTOR} --print-cache-key >> "$GITHUB_OUTPUT"`
    );
    expect(lookup).toContain('lookup-only: true');
    expect(lookup).not.toContain('restore-keys');
    for (const path of CACHE_PATHS) expect(lookup).toContain(path);

    // A hit exits after the lookup; a miss runs the real selector test before
    // any output is saved.
    const miss = "steps.selector-cache.outputs.cache-hit != 'true'";
    const run = step(warm, 'Run pinned Symphony selector');
    expect(run).toContain(miss);
    expect(run.trimEnd().endsWith(`run: bash ${SELECTOR}`)).toBe(true);
    for (const env of SELECTOR_ENV) expect(run).toContain(env);
    expect(step(warm, 'Check Symphony selector cache outputs')).toContain(
      `success() && ${miss}`
    );
    const at = name => warm.indexOf(`      - name: ${name}\n`);
    expect(at('Look up Symphony selector cache')).toBeLessThan(
      at('Run pinned Symphony selector')
    );
    expect(at('Run pinned Symphony selector')).toBeLessThan(
      at('Check Symphony selector cache outputs')
    );
    expect(at('Check Symphony selector cache outputs')).toBeLessThan(
      at('Save Symphony selector cache (trusted main only)')
    );
    const save = step(warm, 'Save Symphony selector cache (trusted main only)');
    expect(save).toContain("github.ref == 'refs/heads/main'");
    expect(save).toContain(
      "steps.selector-cache-ready.outputs.ready == 'true'"
    );
    expect(save).toContain('continue-on-error: true');
    expect(save).toContain(
      'uses: actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0'
    );
    expect(save).toContain(
      'key: ${{ steps.selector-cache.outputs.cache-primary-key }}'
    );
    for (const path of CACHE_PATHS) expect(save).toContain(path);
  });

  function runSelectorWithStubs(installedOtp) {
    const { pin, otp, elixir } = printCacheKey();
    const otpMajor = otp.split('.')[0];
    const root = mkdtempSync(join(tmpdir(), 'selector-cache-'));
    try {
      const log = join(root, 'calls.log');
      const stubs = join(root, 'stubs');
      const prefix = join(root, 'symphony-selector-beam');
      const elixirDir = join(root, 'symphony-selector-src', 'elixir');
      for (const dir of [
        stubs,
        join(prefix, 'bin'),
        join(prefix, 'otp', 'bin'),
        join(prefix, 'otp', 'releases', otpMajor),
        join(elixirDir, 'deps', 'jason'),
        join(elixirDir, '_build', 'test', 'lib'),
      ]) {
        mkdirSync(dir, { recursive: true });
      }
      const stub = (file, body) => {
        writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
        chmodSync(file, 0o755);
      };
      stub(
        join(stubs, 'git'),
        [
          `echo "git $*" >> "${log}"`,
          'if [[ "$1" == clone ]]; then mkdir -p "${@: -1}/.git"; exit 0; fi',
          'if [[ "$3" == checkout ]]; then mkdir -p "$2/elixir/test/symphony_elixir"; fi',
          `if [[ "$3" == rev-parse ]]; then echo "${pin}"; fi`,
          'exit 0',
        ].join('\n')
      );
      stub(join(stubs, 'curl'), `echo "curl $*" >> "${log}"; exit 22`);
      stub(join(prefix, 'otp', 'bin', 'erl'), 'exit 0');
      stub(
        join(prefix, 'bin', 'elixir'),
        `printf 'Erlang/OTP ${otpMajor}\\n\\nElixir ${elixir} (compiled with Erlang/OTP ${otpMajor})\\n'`
      );
      stub(join(prefix, 'bin', 'mix'), `echo "mix $*" >> "${log}"`);
      writeFileSync(
        join(prefix, 'otp', 'releases', otpMajor, 'OTP_VERSION'),
        `${installedOtp ?? otp}\n`
      );
      writeFileSync(join(elixirDir, '_build', 'test', 'lib', 'marker'), 'x');
      const result = spawnSync('bash', [SELECTOR], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          PATH: `${stubs}:/usr/bin:/bin`,
          HOME: root,
          RUNNER_TEMP: root,
          SYMPHONY_ELIXIR_PREFIX: prefix,
        },
      });
      return {
        result,
        calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
        build: existsSync(join(elixirDir, '_build', 'test', 'lib', 'marker')),
        deps: existsSync(join(elixirDir, 'deps', 'jason')),
        parked: existsSync(join(root, 'symphony-selector-src.restored')),
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('reuses a verified warm toolchain and restored build outputs without downloads', () => {
    const run = runSelectorWithStubs();
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.result.stdout).toContain('symphony-selector-beam=warm');
    expect(run.calls).not.toContain('curl');
    expect(run.calls).toMatch(/git clone .*JovieInc\/symphony\.git/);
    expect(run.calls).toContain('mix local.hex --force --if-missing');
    expect(run.calls).toContain('mix local.rebar --force --if-missing');
    expect(run.calls).toContain('mix deps.get');
    expect(run.build).toBe(true);
    expect(run.deps).toBe(true);
    expect(run.parked).toBe(false);
  });

  it('reinstalls instead of trusting a restored toolchain whose OTP drifted', () => {
    const run = runSelectorWithStubs('26.2.5');
    expect(run.result.status).not.toBe(0);
    expect(run.result.stdout).not.toContain('symphony-selector-beam=warm');
    expect(run.calls).toMatch(/curl .*builds\.hex\.pm\/builds\/otp\//);
    expect(run.calls).not.toContain('mix ');
  });
});
