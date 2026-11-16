import { describe, expect, it } from 'vitest';
import { createTestSelector } from '../mutation-diff.mjs';
import {
  configurationPaths,
  evidenceIsCurrent,
  inputDigest,
  mutationInputReceipt,
  sweepEvidenceCandidates,
  untestedMutationEntry,
} from '../mutation-inputs.mjs';

describe('exact mutation input receipts', () => {
  it('binds actual selected helper bytes and missing inputs, independent of order', () => {
    const files = new Map([
      ['lib/a.ts', 'return true'],
      ['tests/shared.ts', 'assert(a)'],
    ]);
    const read = path => files.get(path) ?? null;
    const inputs = [...files.keys()];
    const input = inputDigest(inputs, read);
    expect(inputDigest([...inputs].reverse(), read)).toBe(input);
    const entry = {
      evidence: {
        schemaVersion: 1,
        configDigest: 'config',
        inputs,
        inputDigest: input,
      },
    };
    expect(evidenceIsCurrent(entry, 'config', read)).toBe(true);
    files.set('unrelated.ts', 'changed');
    expect(evidenceIsCurrent(entry, 'config', read)).toBe(true);
    files.set('tests/shared.ts', 'assert(false)');
    expect(evidenceIsCurrent(entry, 'config', read)).toBe(false);
    files.delete('tests/shared.ts');
    expect(evidenceIsCurrent(entry, 'config', read)).toBe(false);
    expect(evidenceIsCurrent(entry, 'other-config', read)).toBe(false);
    expect(evidenceIsCurrent({ score: 100 }, 'config', read)).toBe(false);
  });

  it('invalidates on runner, version, setup and shared package changes', () => {
    const paths = [
      '.nvmrc',
      'pnpm-lock.yaml',
      'apps/web/vitest.config.fast.mts',
      'apps/web/stryker.diff.config.mjs',
      'apps/web/tests/setup.ts',
      'packages/ui/atoms/button.tsx',
      'scripts/lib/mutation-evidence.mjs',
      'apps/web/lib/unrelated.ts',
      'docs/test.md',
    ];
    expect(configurationPaths(paths, 'apps/web')).toEqual(
      expect.arrayContaining([paths[0], paths[1], paths[2], paths[3], paths[6]])
    );
    expect(configurationPaths(paths, 'apps/web')).not.toContain(
      'apps/web/lib/unrelated.ts'
    );
  });
  it('binds active config data and resolves only the exact known workspace imports', () => {
    const files = new Map([
      ['apps/web/lib/a.ts', 'export const a = true'],
      ['apps/web/a.test.ts', "import './lib/a'"],
      [
        'apps/web/vitest.config.fast.mts',
        "await import(pathToFileURL(path.resolve(workspaceRoot, 'scripts/lib/vitest-retry-reporter.mjs')).href);",
      ],
      ['apps/web/tests/node-environment-files.json', '["a.test.ts"]'],
    ]);
    const read = path => files.get(path) ?? null;
    const receipt = () => {
      const selector = createTestSelector(
        new Map([['a.test.ts', read('apps/web/a.test.ts') ?? '']]),
        path => read(`apps/web/${path}`)
      );
      return mutationInputReceipt({
        root: 'apps/web',
        source: 'lib/a.ts',
        tests: ['a.test.ts'],
        selector,
        tracked: [...files.keys()],
        read,
      });
    };
    const first = receipt();
    expect(first.unresolvedInputs).toEqual([]);
    expect(first.inputs).toEqual(
      expect.arrayContaining([
        'scripts/lib/vitest-retry-reporter.mjs',
        'scripts/lib/ci-web-vitest-fast-args.mjs',
        'apps/web/.env.test',
      ])
    );
    files.set('apps/web/tests/node-environment-files.json', '[]');
    expect(receipt().configDigest).not.toBe(first.configDigest);
    files.set(
      'apps/web/vitest.config.fast.mts',
      files.get('apps/web/vitest.config.fast.mts') + ' await import(extra);'
    );
    expect(receipt().unresolvedInputs).toEqual(['vitest.config.fast.mts']);
  });
  it('defers unchanged testless scopes and parks unknown attempts without hiding source changes', () => {
    const files = new Map([
      ['apps/web/lib/a.ts', 'a'],
      ['apps/web/lib/b.ts', 'b'],
    ]);
    const read = path => files.get(path) ?? null;
    const a = untestedMutationEntry(
      'a',
      'apps/web/lib/a.ts',
      'config',
      'graph',
      read
    );
    const b = {
      ...untestedMutationEntry(
        'b',
        'apps/web/lib/b.ts',
        'config',
        'graph',
        read
      ),
      status: 'unknown',
      retryAfterRun: 4,
    };
    const state = { modules: { 'lib/a.ts': a, 'lib/b.ts': b } };
    const candidates = [
      { file: 'lib/a.ts', blob: 'a', testCount: 0 },
      { file: 'lib/b.ts', blob: 'b', testCount: 1 },
    ];
    const held = sweepEvidenceCandidates(
      candidates,
      state,
      'config',
      'graph',
      read,
      2
    );
    expect(held.eligible.map(c => c.file)).toEqual(['lib/a.ts']);
    expect(held.selectionState.modules['lib/a.ts'].blob).toBe('a');
    const retry = sweepEvidenceCandidates(
      candidates,
      state,
      'config',
      'graph',
      read,
      5
    );
    expect(retry.selectionState.modules['lib/b.ts']).toMatchObject({
      blob: 'b',
      status: 'error',
    });
    files.set('apps/web/lib/a.ts', 'changed');
    expect(
      sweepEvidenceCandidates(candidates, state, 'config', 'graph', read, 5)
        .selectionState.modules['lib/a.ts'].blob
    ).toBe('unknown');
  });
});
