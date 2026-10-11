import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const appRequire = createRequire(
  resolve(import.meta.dirname, '../../../apps/web/package.json')
);
const coreRequire = createRequire(appRequire.resolve('@stryker-mutator/core'));

describe('Stryker TypeScript instrumentation', () => {
  it('loads the real sandbox config and preserves retry telemetry', async () => {
    const appRoot = resolve(import.meta.dirname, '../../../apps/web');
    const tempRoot = join(appRoot, '.stryker-tmp');
    mkdirSync(tempRoot, { recursive: true });
    const sandbox = mkdtempSync(join(tempRoot, 'sandbox-config-regression-'));
    const oldCI = process.env.CI;
    const oldJUnit = process.env.VITEST_JUNIT_OUTPUT_FILE;
    try {
      for (const file of [
        'vitest.config.fast.mts',
        'scripts/vitest-duration-sequencer.mjs',
        'tests/node-environment-files.json',
      ]) {
        mkdirSync(dirname(join(sandbox, file)), { recursive: true });
        copyFileSync(join(appRoot, file), join(sandbox, file));
      }
      process.env.CI = 'true';
      process.env.VITEST_JUNIT_OUTPUT_FILE = join(sandbox, 'unit.junit.xml');
      const { loadConfigFromFile } = await import(
        pathToFileURL(appRequire.resolve('vite')).href
      );
      const loaded = await loadConfigFromFile(
        { command: 'serve', mode: 'test' },
        join(sandbox, 'vitest.config.fast.mts')
      );
      expect(loaded.config.root).toBe(sandbox);
      const reporter = loaded.config.test.reporters.find(
        candidate => typeof candidate.onTestRunEnd === 'function'
      );
      expect(reporter).toBeDefined();
      reporter.onTestRunEnd();
      expect(
        JSON.parse(readFileSync(join(sandbox, 'unit.flaky.json'), 'utf8'))
      ).toMatchObject({
        schemaVersion: 2,
        flaky: [],
        executions: [],
        complete: false,
      });
      expect(
        loaded.config.resolve.alias.find(
          alias => alias.find instanceof RegExp && alias.find.test('@jovie/ui')
        ).replacement
      ).toBe(resolve(appRoot, '../../packages/ui'));
    } finally {
      if (oldCI === undefined) delete process.env.CI;
      else process.env.CI = oldCI;
      if (oldJUnit === undefined) delete process.env.VITEST_JUNIT_OUTPUT_FILE;
      else process.env.VITEST_JUNIT_OUTPUT_FILE = oldJUnit;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('prints function types and produces real mutants with the installed Babel stack', async () => {
    const { Instrumenter } = await import(
      coreRequire.resolve('@stryker-mutator/instrumenter')
    );
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      isDebugEnabled: () => false,
    };
    const instrumenter = new Instrumenter(logger);
    const source =
      'export type Predicate = (value: string) => boolean; export const positive = (value: number) => value > 0;';
    const result = await instrumenter.instrument(
      [{ name: '/tmp/nightly-hotspot.ts', content: source, mutate: true }],
      { plugins: null, ignorers: [], excludedMutations: [] }
    );
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toContain('Predicate');
    expect(result.files[0].content).toContain('stryMutAct');
    expect(result.mutants.length).toBeGreaterThan(0);
    expect(
      result.mutants.some(mutant => mutant.replacement.includes('>='))
    ).toBe(true);
  });
});
