import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSelector } from '../mutation-diff.mjs';
import {
  configurationPaths,
  evidenceIsCurrent,
  inputDigest,
  mutationInputReceipt,
  sweepEvidenceCandidates,
  untestedMutationEntry,
} from '../mutation-inputs.mjs';
import { pickBatch } from '../mutation-sweep.mjs';
import { recordEvidenceAttempt } from '../mutation-sweep-attempt.mjs';

describe('exact mutation input receipts', () => {
  afterEach(() => vi.useRealTimers());
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
  it('defers identical config-review evidence without losing its anchor or hiding changed inputs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T00:00:00Z'));
    const path = 'apps/web/lib/a.ts';
    const files = new Map([[path, 'export const a = true;']]);
    const read = file => files.get(file) ?? null;
    const anchor = {
      schemaVersion: 1,
      configDigest: 'old-config',
      score: 90,
      valid: 40,
      sha: 'a'.repeat(40),
      at: '2020-01-01T00:00:00Z',
    };
    const { entry } = recordEvidenceAttempt({
      state: { modules: {} },
      file: 'lib/a.ts',
      blob: 'blob',
      sha: 'b'.repeat(40),
      at: new Date().toISOString(),
      durationMs: 10,
      mutants: Array.from({ length: 40 }, () => ({ status: 'Killed' })),
      partialMutants: undefined,
      source: files.get(path),
      tests: ['a.test.ts'],
      baseline: { files: {} },
      equivalents: { entries: [] },
      configDigest: 'config',
      runId: 1,
      unchanged: true,
      timedOut: false,
      error: undefined,
      previous: { highWater: anchor },
      receipt: {
        schemaVersion: 1,
        configDigest: 'config',
        selectionDigest: 'graph',
        inputs: [path],
        inputDigest: inputDigest([path], read),
      },
    });
    expect(entry).toMatchObject({
      status: 'unknown',
      score: null,
      measuredScore: 100,
      highWater: anchor,
    });
    const candidate = { file: 'lib/a.ts', blob: 'blob', testCount: 1 };
    const select = (
      config = 'config',
      graph = 'graph',
      previous = entry,
      highWater = {}
    ) =>
      sweepEvidenceCandidates(
        [candidate],
        { modules: { 'lib/a.ts': structuredClone(previous) }, highWater },
        config,
        graph,
        read,
        100
      );
    expect(select().eligible).toEqual([]);
    expect(
      select('config', 'graph', { ...entry, highWater: undefined }).eligible
    ).toEqual([]);
    const deferred = select();
    expect(
      pickBatch(deferred.selectionState, deferred.eligible, {
        max: 1,
        now: Date.now() + 2 * 86_400_000,
      })
    ).toEqual([]);
    expect(select().selectionState.modules['lib/a.ts']).toMatchObject({
      status: 'error',
      score: null,
      highWater: anchor,
    });
    expect(select('next-config').eligible).toEqual([candidate]);
    expect(select('config', 'new-graph').eligible).toEqual([candidate]);
    for (const retry of [select('next-config'), select('config', 'new-graph')])
      expect(
        pickBatch(retry.selectionState, retry.eligible, { max: 1 })
      ).toEqual(['lib/a.ts']);
    expect(
      select('config', 'graph', {
        ...entry,
        highWater: { ...anchor, configDigest: 'config' },
      }).eligible
    ).toEqual([candidate]);
    const reviewed = select('config', 'graph', entry, {
      'lib/a.ts': { ...anchor, configDigest: 'config' },
    });
    expect(
      pickBatch(reviewed.selectionState, reviewed.eligible, { max: 1 })
    ).toEqual(['lib/a.ts']);
    files.set(path, 'export const a = false;');
    expect(select().eligible).toEqual([candidate]);
    expect(entry.highWater).toEqual(anchor);
    expect(entry.status).toBe('unknown');
  });
});
