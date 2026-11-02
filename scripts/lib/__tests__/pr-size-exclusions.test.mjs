import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countSizeGuardFiles } from '../merge-group-member-policy.mjs';
import {
  filterCountedRows,
  isSizeExcluded,
  TEST_SIZE_EXCLUSION,
} from '../pr-size-exclusions.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const MODULE = resolve(ROOT, 'scripts/lib/pr-size-exclusions.mjs');

describe('PR size exclusions', () => {
  it('does not count tests or fixtures in any shipped language', () => {
    for (const path of [
      'scripts/lib/__tests__/merge-queue-guard.test.mjs',
      'apps/web/tests/unit/lib/auth/rate-limit-rules.test.ts',
      'apps/web/components/Button.spec.tsx',
      'apps/web/tests/e2e/auth-public-ready.spec.ts',
      'packages/ui/src/__tests__/helpers.ts',
      'scripts/lib/__tests__/fixtures/controller.json',
      'apps/web/tests/__fixtures__/profile.json',
      'scripts/tests/test_waste_loop.py',
      'scripts/lanes/factory_intake_test.py',
      'apps/ios/JovieTests/AuthScreenStyleGuardTests.swift',
    ]) {
      expect(isSizeExcluded(path), path).toBe(true);
    }
  });

  it('keeps counting production code, including names that only look like tests', () => {
    for (const path of [
      'apps/web/lib/auth/rate-limit-rules.ts',
      'scripts/lib/merge-group-member-policy.mjs',
      'apps/web/app/testimonials/page.tsx',
      'apps/web/lib/contest.ts',
      'apps/web/lib/latest.ts',
      'scripts/lib/fixtures-loader.mjs',
      'apps/ios/Jovie/Views/TestsView.swift.md',
      'scripts/testing_helpers.py',
      '.github/workflows/pr-size-guard.yml',
    ]) {
      expect(isSizeExcluded(path), path).toBe(false);
    }
    expect(isSizeExcluded('')).toBe(false);
    expect(isSizeExcluded(undefined)).toBe(false);
  });

  it('still excludes generated, lock and snapshot noise', () => {
    for (const path of [
      'pnpm-lock.yaml',
      'apps/web/drizzle/migrations/meta/0161_snapshot.json',
      'docs/performance/generated/public-profile-alias-measurements.jsonl',
      'apps/web/__snapshots__/hero.snap',
      'scripts/lib/domain-write-guard.ratchet.gen.json',
    ]) {
      expect(isSizeExcluded(path), path).toBe(true);
    }
  });

  it('turns the #23956 shape back under the cap: production lines count, test lines do not', () => {
    const files = [
      { filename: 'scripts/lib/feature.mjs', additions: 1400, deletions: 69 },
      {
        filename: 'scripts/lib/__tests__/feature.test.mjs',
        additions: 292,
        deletions: 0,
      },
    ];
    expect(countSizeGuardFiles(files)).toEqual({ lines: 1469, files: 1 });
  });

  it('filters numstat rows and rejects unparseable rows', () => {
    const rows = [
      '120\tapps/web/lib/a.ts',
      '300\tapps/web/tests/unit/a.test.ts',
      '',
      '9\tpnpm-lock.yaml',
      '4\tapps/web/lib/b.ts',
    ].join('\n');
    expect(filterCountedRows(rows)).toBe(
      '120\tapps/web/lib/a.ts\n4\tapps/web/lib/b.ts'
    );
    expect(filterCountedRows('')).toBe('');
    expect(() => filterCountedRows('no tab here')).toThrow('unparseable');
  });

  it('runs as the stdin filter the workflows call', () => {
    const result = spawnSync(process.execPath, [MODULE], {
      input: '7\tsrc/a.ts\n5\tsrc/a.test.ts\n',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('7\tsrc/a.ts\n');
    const empty = spawnSync(process.execPath, [MODULE], {
      input: '5\tsrc/a.test.ts\n',
      encoding: 'utf8',
    });
    expect(empty.stdout).toBe('');
  });

  it('is the single exclusion list: no workflow keeps its own copy', () => {
    for (const workflow of [
      '.github/workflows/pr-size-guard.yml',
      '.github/workflows/pr-size-guard-label-override.yml',
    ]) {
      const text = readFileSync(resolve(ROOT, workflow), 'utf8');
      expect(text, workflow).not.toMatch(/EXCLUDE=/);
      expect(text, workflow).toContain('scripts/lib/pr-size-exclusions.mjs');
      expect(text, workflow).toContain('SIZE_POLICY_REF');
    }
    expect(
      readFileSync(
        resolve(ROOT, 'scripts/lib/merge-group-member-policy.mjs'),
        'utf8'
      )
    ).toContain("from './pr-size-exclusions.mjs'");
    expect(TEST_SIZE_EXCLUSION.source.length).toBeGreaterThan(0);
  });
});
