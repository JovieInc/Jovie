import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCRIPT_CONTRACT_NODE_TESTS,
  SCRIPT_CONTRACT_VITEST_TESTS,
} from '../../ci-fast-lanes.mjs';
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
  it('runs every scripts/ test file from some CI entry point', async () => {
    const { unrun } = await inventoryScriptTests(REPO_ROOT);
    const orphans = unrun.filter(file => !Object.hasOwn(EXCEPTIONS, file));
    // Name the orphans first: CI failure summaries truncate the diff.
    expect(
      orphans,
      `Unwired: ${orphans.join(', ')}. Wire each file into a ci-fast lane (SCRIPT_CONTRACT_NODE_TESTS / SCRIPT_CONTRACT_VITEST_TESTS in scripts/ci-fast-lanes.mjs) or delete it if obsolete.`
    ).toEqual([]);
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
    ]) {
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
    'scripts/symphony/lib/__tests__/typed.test.ts',
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
          text: 'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/rel.test.mjs symphony/lib/__tests__/typed.test.ts',
        },
      ],
      files
    );
    expect(refs.get('scripts/a.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/verification/one.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/verification/two.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/lib/__tests__/rel.test.mjs')?.size).toBe(1);
    expect(refs.get('scripts/symphony/lib/__tests__/typed.test.ts')?.size).toBe(
      1
    );
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
