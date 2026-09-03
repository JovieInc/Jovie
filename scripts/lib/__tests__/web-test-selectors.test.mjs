import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCHEMA_VERSION,
  isSupportedTypecheckNode,
} from '../../typecheck-scripts.mjs';
import {
  buildReceipt,
  collectChangedFiles,
} from '../../web-test-surface-receipt.mjs';
import {
  AUTHORITATIVE_WEB_UNIT_COMMAND,
  AUTHORITATIVE_WEB_UNIT_TURBO_TASK,
  buildAuthoritativeTestCommand,
  classifyTypecheckDiagnostics,
  ensureMinHeapMb,
  isAuthoritativeUnitTest,
  selectChangedSurfaceTests,
  WEB_TEST_SURFACE_RECEIPT_SCHEMA,
  WEB_TEST_TYPECHECK_HEAP_MB,
} from '../web-test-selectors.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

describe('authoritative web unit selector', () => {
  it('pins test:ci to merge-group test:fast and records a shrink-only baseline', () => {
    expect(AUTHORITATIVE_WEB_UNIT_TURBO_TASK).toBe('test:fast');
    expect(AUTHORITATIVE_WEB_UNIT_COMMAND).toBe(
      'pnpm --filter=@jovie/web run test:fast'
    );
    expect(WEB_TEST_TYPECHECK_HEAP_MB).toBe(8192);
    expect(read('turbo.json')).toMatch(/"test:ci":\s*\{/);
    expect(json('package.json').scripts['test:ci']).toBe(
      'node scripts/turbo-local.mjs test:ci --filter=@jovie/web'
    );
    const web = json('apps/web/package.json');
    expect(web.scripts['test:ci']).toContain('--config=vitest.config.mts');
    expect(web.scripts['typecheck:tests']).toContain(
      'scripts/typecheck-web-tests.mjs'
    );
    expect(read('.github/workflows/ci.yml')).toContain(
      'pnpm turbo test:fast --filter=@jovie/web -- $VITEST_CI_FLAGS'
    );

    const tsconfig = json('apps/web/tsconfig.test.json');
    expect(tsconfig.exclude).toEqual(
      expect.arrayContaining(['tests/e2e/**', 'tests/integration/**'])
    );
    expect(tsconfig.compilerOptions.skipLibCheck).toBe(true);
    const baseline = json('apps/web/typecheck-tests-baseline.json');
    expect(isSupportedTypecheckNode(process.version)).toBe(true);
    expect(baseline.schemaVersion).toBe(BASELINE_SCHEMA_VERSION);
    expect(baseline.tool).toBe('scripts/typecheck-web-tests.mjs');
    expect(baseline.selector).toBe(AUTHORITATIVE_WEB_UNIT_COMMAND);
    let sum = 0;
    for (const [file, byCode] of Object.entries(baseline.files)) {
      expect(file).not.toContain('@types/react');
      for (const [code, count] of Object.entries(byCode)) {
        expect(code).toMatch(/^TS\d+$/);
        expect(code).not.toBe('TS6200');
        sum += count;
      }
    }
    expect(baseline.totalErrors).toBe(sum);
    expect(
      ensureMinHeapMb({ NODE_OPTIONS: '--max-old-space-size=4096' }, 8192)
        .NODE_OPTIONS
    ).toContain('--max-old-space-size=8192');
  });

  it('selects colocated tests and fails only for changed-surface regressions', () => {
    expect(
      collectChangedFiles('origin/main', args =>
        args.join(' ') === 'ls-files --others --exclude-standard'
          ? 'packages/ui/atoms/skeleton.tsx\npackages/ui/atoms/skeleton.test.tsx'
          : ''
      )
    ).toEqual([
      'packages/ui/atoms/skeleton.test.tsx',
      'packages/ui/atoms/skeleton.tsx',
    ]);
    const exists = new Set([
      'packages/ui/atoms/skeleton.test.tsx',
      'apps/web/tests/unit/components/LoadingSkeleton.test.tsx',
    ]);
    const selected = selectChangedSurfaceTests(
      [
        'packages/ui/atoms/skeleton.tsx',
        'apps/web/components/molecules/LoadingSkeleton.tsx',
        'apps/web/tests/e2e/smoke-public.spec.ts',
      ],
      {
        existsSync: file => exists.has(file),
        readCoverageVia: file =>
          file.endsWith('LoadingSkeleton.tsx')
            ? 'apps/web/tests/unit/components/LoadingSkeleton.test.tsx'
            : null,
      }
    );
    expect(selected).toEqual([
      'apps/web/tests/unit/components/LoadingSkeleton.test.tsx',
      'packages/ui/atoms/skeleton.test.tsx',
    ]);
    expect(
      isAuthoritativeUnitTest('apps/web/tests/e2e/smoke-public.spec.ts')
    ).toBe(false);
    expect(buildAuthoritativeTestCommand(selected)[1]).toBe(
      'pnpm --filter=@jovie/ui run test -- atoms/skeleton.test.tsx'
    );
    const classified = classifyTypecheckDiagnostics(
      new Map([
        [
          'apps/web/components/molecules/LoadingSkeleton.tsx',
          new Map([['TS2322', 1]]),
        ],
        ['apps/web/tests/unit/unrelated.test.ts', new Map([['TS2307', 4]])],
      ]),
      ['apps/web/components/molecules/LoadingSkeleton.tsx'],
      { files: { 'apps/web/tests/unit/unrelated.test.ts': { TS2307: 4 } } }
    );
    expect(classified.changedSurfaceRegressions).toHaveLength(1);
    expect(classified.fleetRegressions).toEqual([]);
    const fail = buildReceipt({
      base: 'origin/main',
      headSha: 'abc',
      changedFiles: ['packages/ui/atoms/skeleton.tsx'],
      selectedTests: selected,
      typecheck: {
        mode: 'bounded',
        changedSurfaceRegressions: classified.changedSurfaceRegressions,
        fleetDebt: classified.fleetDebt,
      },
      tests: { skipped: true, results: [] },
    });
    expect(fail.schema).toBe(WEB_TEST_SURFACE_RECEIPT_SCHEMA);
    expect(fail.verdict).toBe('fail-changed-surface');
    expect(
      buildReceipt({
        ...fail,
        typecheck: {
          ...fail.typecheck,
          changedSurfaceRegressions: [],
        },
      }).verdict
    ).toBe('pass');
  });
});
