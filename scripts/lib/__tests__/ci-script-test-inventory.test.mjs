import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MESH_CURRENT_WIRE_COVERAGE_COMMAND,
  MESH_HOST_ACK_COVERAGE_COMMAND,
  MESH_NATIVE_TERMINAL_COVERAGE_COMMAND,
  MESH_RUNTIME_BUNDLE_COVERAGE_COMMAND,
  runStructural,
  SCRIPT_CONTRACT_NODE_TESTS,
  SCRIPT_CONTRACT_VITEST_TESTS,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { buildControlTestCommands } from '../../run-affected-tests.mjs';
import {
  collectCiCommands,
  expandPackageScripts,
  extractRunBlocks,
  inventoryScriptTests,
  KNOWN_RED_ORPHANS,
  listScriptTestFiles,
  mapTestReferences,
  RUNNER_ONLY_EXCEPTIONS,
} from '../ci-script-test-inventory.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const EXCEPTIONS = { ...RUNNER_ONLY_EXCEPTIONS, ...KNOWN_RED_ORPHANS };

describe('scripts test inventory guard', () => {
  it('selects and expands future automation-liveness splits in the existing lane', () => {
    const future =
      'scripts/lib/__tests__/automation-liveness-future-split.test.mjs';
    const existing = 'scripts/lib/__tests__/automation-liveness.test.mjs';
    for (const event of ['pull_request', 'merge_group', 'push']) {
      expect(
        selectSourceGuards(event, [future]).some(
          guard => guard.id === 'automation-registry'
        )
      ).toBe(true);
    }
    const guard = selectSourceGuards('pull_request', [future]).find(
      item => item.id === 'automation-registry'
    );
    const root = mkdtempSync(join(tmpdir(), 'liveness-lane-'));
    try {
      mkdirSync(join(root, 'scripts/lib/__tests__'), { recursive: true });
      mkdirSync(join(root, 'bin'));
      for (const file of [existing, future])
        writeFileSync(join(root, file), '');
      // Record real shell expansion without running the unrelated coverage stage.
      writeFileSync(join(root, 'bin/node'), '#!/bin/sh\nexit 0\n', {
        mode: 0o755,
      });
      writeFileSync(
        join(root, 'bin/pnpm'),
        '#!/bin/sh\nprintf "%s\\n" "$@"\n',
        {
          mode: 0o755,
        }
      );
      const result = spawnSync('bash', ['-c', guard.command], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        },
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      const args = result.stdout.trim().split('\n');
      expect(args).toContain(existing);
      expect(args).toContain(future);
      const refs = mapTestReferences(
        [{ source: 'automation-registry', text: guard.command }],
        [existing, future]
      );
      expect([...refs.values()].every(sources => sources.size > 0)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs the inventory in source validation control commands before queue admission', () => {
    const commands = buildControlTestCommands().map(([command, args]) =>
      [command, ...args].join(' ')
    );
    expect(
      commands.some(command =>
        command.includes('lib/__tests__/ci-script-test-inventory.test.mjs')
      )
    ).toBe(true);
  });
  it('executes receiver tests and their enforced coverage from the maintained structural lane', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_PYTEST', '');
    vi.stubEnv('CI_FAST_STRUCTURAL_WEB', '');
    vi.stubEnv('CI_FAST_STRUCTURAL_ABORT_STATUS_FILE', '');
    const execute = vi
      .fn()
      .mockReturnValue({ code: 0, output: 'contract fixture\n' });
    try {
      const result = await runStructural({ execute });
      expect(result.code).toBe(0);
      const commands = execute.mock.calls.map(([command]) => command);
      expect(commands).toContain(MESH_HOST_ACK_COVERAGE_COMMAND);
      expect(commands).toContain(MESH_NATIVE_TERMINAL_COVERAGE_COMMAND);
      expect(commands).toContain(MESH_RUNTIME_BUNDLE_COVERAGE_COMMAND);
      expect(commands).toContain(MESH_CURRENT_WIRE_COVERAGE_COMMAND);
      expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
        'scripts/lib/__tests__/mesh-current-wire.test.mjs'
      );
      expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
        'scripts/lib/__tests__/mesh-runtime-bundle.test.mjs'
      );
      expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
        'scripts/lib/__tests__/mesh-native-terminal.test.mjs'
      );
      for (const flag of [
        '--coverage.include=lanes/mesh-native-terminal.mjs',
        '--coverage.thresholds.perFile=true',
        '--coverage.thresholds.lines=90',
        '--coverage.thresholds.statements=90',
        '--coverage.thresholds.branches=85',
        '--coverage.thresholds.functions=90',
      ])
        expect(MESH_NATIVE_TERMINAL_COVERAGE_COMMAND).toContain(flag);
      expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
        'scripts/lib/__tests__/mesh-host-ack.test.mjs'
      );
      expect(
        commands.some(command =>
          command.includes(
            'run lib/__tests__/merge-group-failure-hold.test.mjs lib/__tests__/mesh-host-ack.test.mjs'
          )
        )
      ).toBe(true);
      for (const flag of [
        '--coverage.include=lanes/mesh-host-ack.mjs',
        '--coverage.thresholds.perFile=true',
        '--coverage.thresholds.lines=99',
        '--coverage.thresholds.statements=99',
        '--coverage.thresholds.branches=90',
        '--coverage.thresholds.functions=100',
      ])
        expect(MESH_HOST_ACK_COVERAGE_COMMAND).toContain(flag);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('runs every scripts/ test file from some CI entry point', async () => {
    const { unrun } = await inventoryScriptTests(REPO_ROOT);
    const orphans = unrun.filter(file => !Object.hasOwn(EXCEPTIONS, file));
    // Name the orphans first: CI failure summaries truncate the diff.
    expect(
      orphans,
      `Unwired: ${orphans.join(', ')}. Wire each file into a ci-fast lane (SCRIPT_CONTRACT_NODE_TESTS / SCRIPT_CONTRACT_VITEST_TESTS in scripts/ci-fast-lanes.mjs) or delete it if obsolete.`
    ).toEqual([]);
  });

  it('discovers the wired planner group and leaves unwired helpers and new orphans unrun', async () => {
    const root = mkdtempSync(join(tmpdir(), 'planner-ci-inventory-'));
    const test = 'scripts/lib/__tests__/planner-fixture.test.mjs';
    const orphan = 'scripts/lib/__tests__/unregistered-fixture.test.mjs';
    const helper = 'scripts/lib/test-planner-contract-tests.mjs';
    const importLine =
      "import { TEST_PLANNER_CONTRACT_TESTS } from './lib/test-planner-contract-tests.mjs';";
    mkdirSync(join(root, 'scripts/lib'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"scripts":{}}');
    writeFileSync(
      join(root, helper),
      "export const TEST_PLANNER_CONTRACT_TESTS = ['" + test + "'];"
    );
    const referenced = async (wiredImport, wiredSpread) => {
      writeFileSync(
        join(root, 'scripts/ci-fast-lanes.mjs'),
        (wiredImport ? importLine : '') +
          '\nexport const SCRIPT_CONTRACT_NODE_TESTS = Object.freeze([' +
          (wiredSpread ? '...TEST_PLANNER_CONTRACT_TESTS,' : '') +
          ']);'
      );
      return mapTestReferences(await collectCiCommands(root), [test, orphan]);
    };
    try {
      expect((await referenced(true, true)).get(test)?.has(helper)).toBe(true);
      expect((await referenced(true, true)).get(orphan)?.size).toBe(0);
      expect((await referenced(false, true)).get(test)?.size).toBe(0);
      expect((await referenced(true, false)).get(test)?.size).toBe(0);
      const actualLane =
        importLine +
        '\nexport const SCRIPT_CONTRACT_NODE_TESTS = Object.freeze([\n...TEST_PLANNER_CONTRACT_TESTS,\n]);';
      for (const inert of [
        actualLane
          .split('\n')
          .map(line => '// ' + line)
          .join('\n'),
        '/*\n' + actualLane + '\n*/',
        'const inert = ' + JSON.stringify(actualLane) + ';',
      ]) {
        writeFileSync(join(root, 'scripts/ci-fast-lanes.mjs'), inert);
        const refs = mapTestReferences(await collectCiCommands(root), [
          test,
          orphan,
        ]);
        expect(refs.get(test)?.size).toBe(0);
        expect(refs.get(orphan)?.size).toBe(0);
      }
      writeFileSync(join(root, 'scripts/ci-fast-lanes.mjs'), 'export const =;');
      await expect(collectCiCommands(root)).rejects.toThrow(
        /Cannot parse CI planner wiring/
      );
      rmSync(join(root, helper));
      await expect(referenced(true, true)).rejects.toThrow(/ENOENT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps every exception real, reasoned and still unwired', async () => {
    const { files, unrun } = await inventoryScriptTests(REPO_ROOT);
    const unrunSet = new Set(unrun);
    for (const [file, reason] of Object.entries(EXCEPTIONS)) {
      expect(files, `${file} no longer exists`).toContain(file);
      expect(unrunSet.has(file), `${file} is wired; drop its exception`).toBe(
        true
      );
      expect(reason.trim().length, `${file} needs a reason`).toBeGreaterThan(
        20
      );
    }
    expect(
      Object.keys(RUNNER_ONLY_EXCEPTIONS).filter(file =>
        Object.hasOwn(KNOWN_RED_ORPHANS, file)
      )
    ).toEqual([]);
  });

  it('lists only existing files in the orphan-sweep lane commands', () => {
    for (const file of [
      ...SCRIPT_CONTRACT_NODE_TESTS,
      ...SCRIPT_CONTRACT_VITEST_TESTS,
    ].flatMap(entry => entry.split(' '))) {
      expect(existsSync(resolve(REPO_ROOT, file)), file).toBe(true);
    }
  });

  it('fails on a new orphan test file', async () => {
    const files = [
      ...listScriptTestFiles(REPO_ROOT),
      'scripts/lib/__tests__/zz-new-orphan.test.mjs',
    ];
    const { unrun } = await inventoryScriptTests(REPO_ROOT, { files });
    expect(unrun).toContain('scripts/lib/__tests__/zz-new-orphan.test.mjs');
  });

  it('discovers tests outside fixture trees only', () => {
    const files = listScriptTestFiles(REPO_ROOT);
    expect(files).toContain('scripts/ci-cache-policy.test.mjs');
    expect(files.some(file => file.includes('/fixtures/'))).toBe(false);
    expect(files.some(file => file.includes('node_modules'))).toBe(false);
  });
});

describe('command resolution', () => {
  const files = [
    'scripts/a.test.mjs',
    'scripts/verification/one.test.mjs',
    'scripts/verification/two.test.mjs',
    'scripts/lib/__tests__/rel.test.mjs',
    'scripts/gate-ladder/typed.test.ts',
    'scripts/never.test.mjs',
  ];

  it('resolves repo paths, globs and scripts-root Vitest paths', () => {
    const refs = mapTestReferences(
      [
        { source: 'lane', text: "'node --test scripts/a.test.mjs'" },
        {
          source: 'lane',
          text: "node --test --test-coverage-include='scripts/verification/*.mjs' scripts/verification/*.test.mjs",
        },
        {
          source: 'lane',
          text: 'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/rel.test.mjs gate-ladder/typed.test.ts',
        },
      ],
      files
    );
    expect(refs.get('scripts/a.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/verification/one.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/verification/two.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/lib/__tests__/rel.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/gate-ladder/typed.test.ts')?.size).toBe(1);
    expect(refs.get('scripts/never.test.mjs')?.size).toBe(0);
  });

  it('does not treat relative paths outside a scripts-root Vitest run as scripts tests', () => {
    const refs = mapTestReferences(
      [
        {
          source: 'lane',
          text: 'pnpm --filter @jovie/web exec vitest run lib/__tests__/rel.test.mjs',
        },
      ],
      files
    );
    expect(refs.get('scripts/lib/__tests__/rel.test.mjs')?.size).toBe(0);
  });

  it('follows only package scripts reachable from CI commands', () => {
    const reached = expandPackageScripts(
      [{ source: 'ci.yml', text: 'pnpm run outer && pnpm -w lint' }],
      {
        outer: 'pnpm inner',
        inner: 'node --test scripts/a.test.mjs',
        lint: 'biome check',
        orphaned: 'node --test scripts/never.test.mjs',
      }
    );
    expect(reached.map(command => command.source).sort()).toEqual([
      'package.json#inner',
      'package.json#lint',
      'package.json#outer',
    ]);
  });

  it('extracts inline and block run steps, not path filters', () => {
    const blocks = extractRunBlocks(
      [
        'on:',
        '  push:',
        '    paths:',
        "      - 'scripts/never.test.mjs'",
        'jobs:',
        '  x:',
        '    steps:',
        '      - run: node --test scripts/a.test.mjs',
        '      - name: block',
        '        run: |',
        '          node --test \\',
        '            scripts/verification/one.test.mjs',
        '      - name: after',
        '        env:',
        '          A: b',
      ].join('\n')
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe('node --test scripts/a.test.mjs');
    expect(blocks[1]).toContain('scripts/verification/one.test.mjs');
    expect(blocks.join('\n')).not.toContain('never');
  });

  it('expands the run-affected-tests control suite when CI reaches it', async () => {
    const commands = await collectCiCommands(REPO_ROOT, {
      controlCommands: async () => ['pnpm exec vitest --root scripts run x'],
    });
    expect(
      commands.some(
        command => command.source === 'run-affected-tests.mjs --control'
      )
    ).toBe(true);
  });

  it('follows pnpm scripts reached from control suite stages', async () => {
    const commands = await collectCiCommands(REPO_ROOT, {
      controlCommands: async () => ['pnpm run test:rolling-ci-fx:coverage'],
    });
    const fxCoverage = commands.find(
      command => command.source === 'package.json#test:rolling-ci-fx:coverage'
    );
    expect(fxCoverage?.text).toContain(
      'lib/__tests__/rolling-ci-fx-finish.test.mjs'
    );
  });
});
