import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_CI_JUDGE_VITEST_MARKER,
  DESIGN_CI_JUDGE_VITEST_PATHS,
  expandSourcePoolEntries,
  filterMergedWithBasePoolEntries,
  MERGED_WITH_BASE_POOL_SPEC,
  runSourceGuardPool,
  SCREEN_CERTIFICATION_TEST_MARKER,
  SCREEN_CERTIFICATION_TEST_PATHS,
} from '../../ci-fast-lanes.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('merged-with-base path-gates', () => {
  it('path-gates design-ci-judge and screen-certification by related paths', () => {
    const entries = expandSourcePoolEntries(MERGED_WITH_BASE_POOL_SPEC);
    const isJudge = e => e.command.includes(DESIGN_CI_JUDGE_VITEST_MARKER);
    const isScreen = e => e.command.includes(SCREEN_CERTIFICATION_TEST_MARKER);
    const isLatency = e =>
      e.command.includes('latency-sensitive-execution.test.mjs');
    expect(entries.some(isJudge)).toBe(true);
    expect(entries.some(isScreen)).toBe(true);
    expect(entries.some(isLatency)).toBe(true);
    expect(entries.some(e => isScreen(e) && isLatency(e))).toBe(false);
    const { kept, skipped } = filterMergedWithBasePoolEntries(entries, [
      'docs/qa/README.md',
      'scripts/lib/__tests__/ci-source-guard-pool.test.mjs',
    ]);
    expect(skipped.some(isJudge)).toBe(true);
    expect(skipped.some(isScreen)).toBe(true);
    expect(kept.some(isJudge)).toBe(false);
    expect(kept.some(isScreen)).toBe(false);
    expect(kept.some(isLatency)).toBe(true);
    expect(
      kept.some(e =>
        e.command.includes('design-ci-judge-router-contract.test.mjs')
      )
    ).toBe(true);
    for (const related of [
      'apps/web/scripts/design-ci-judge-router.ts',
      'apps/web/package.json',
      'apps/web/vitest.config.mts',
      'apps/web/data/appScreens/registry.ts',
      'apps/web/data/marketing/componentRegistry.ts',
    ]) {
      expect(DESIGN_CI_JUDGE_VITEST_PATHS.test(related), related).toBe(true);
      const r = filterMergedWithBasePoolEntries(entries, [related]);
      expect(r.kept.some(isJudge), related).toBe(true);
      expect(r.skipped.some(isScreen), related).toBe(true);
    }
    for (const related of [
      'canon/invariants.jsonl',
      'scripts/invariants/registry.mjs',
      'scripts/invariants/screen-certification.mjs',
      'scripts/invariants/screen-registry.mjs',
      'scripts/invariants/screen-proof-emit.mjs',
      'scripts/invariants/browser-owned-input.mjs',
      'scripts/invariants/product-reference-coherence.mjs',
      '.github/workflows/screenshots.yml',
      'apps/web/tests/product-screenshots/public-screens-proof.spec.ts',
    ]) {
      expect(SCREEN_CERTIFICATION_TEST_PATHS.test(related), related).toBe(true);
      const r = filterMergedWithBasePoolEntries(entries, [related]);
      expect(r.kept.some(isScreen), related).toBe(true);
    }
    // child-process.mjs: test harness only. Production cert uses
    // node:child_process, so excluding the wrapper cannot skip a cert-behavior
    // change. Wrapper PRs still force full script contracts + child-process.test.
    const certProd = readFileSync(
      join(REPO_ROOT, 'scripts/invariants/screen-certification.mjs'),
      'utf8'
    );
    const certTest = readFileSync(
      join(REPO_ROOT, 'scripts/invariants/screen-certification.test.mjs'),
      'utf8'
    );
    expect(certProd).toMatch(/from ['"]node:child_process['"]/);
    expect(certProd).not.toMatch(/lib\/child-process/);
    expect(certTest).toMatch(/from ['"].*child-process\.mjs['"]/);
    expect(
      SCREEN_CERTIFICATION_TEST_PATHS.test('scripts/lib/child-process.mjs')
    ).toBe(false);
    const onlyWrapper = filterMergedWithBasePoolEntries(entries, [
      'scripts/lib/child-process.mjs',
    ]);
    expect(onlyWrapper.skipped.some(isScreen)).toBe(true);
    expect(onlyWrapper.kept.some(isLatency)).toBe(true);
    expect(
      DESIGN_CI_JUDGE_VITEST_PATHS.test('apps/web/app/(home)/page.tsx')
    ).toBe(false);
    for (const changed of [null, undefined, []]) {
      const r = filterMergedWithBasePoolEntries(entries, changed);
      expect(r.skipped, String(changed)).toEqual([]);
      expect(r.kept.length, String(changed)).toBe(entries.length);
    }
  });

  it('logs a skip line and does not execute the gated vitest', async () => {
    const started = [];
    const { code, output } = await runSourceGuardPool(
      {
        concurrency: 2,
        commands: [
          { id: 'cheap', command: 'node -e "process.exit(0)"' },
          {
            id: 'judge',
            command: `pnpm --filter @jovie/web exec vitest run ${DESIGN_CI_JUDGE_VITEST_MARKER}`,
          },
        ],
      },
      {
        changedFileList: ['README.md'],
        execute: async command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      }
    );
    expect(code).toBe(0);
    expect(started).toEqual(['node -e "process.exit(0)"']);
    expect(output).toContain('[merged-with-base] skip: judge;');
    expect(output).toContain('design-ci-judge vitest');
  });
});
