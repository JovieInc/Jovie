import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const appRequire = createRequire(
  resolve(import.meta.dirname, '../../../apps/web/package.json')
);
const coreRequire = createRequire(appRequire.resolve('@stryker-mutator/core'));

describe('Stryker TypeScript instrumentation', () => {
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
