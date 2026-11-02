import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRIPT_CONTRACT_VITEST_TESTS } from '../../ci-fast-lanes.mjs';
import {
  coveringProjectRoots,
  inventoryOrphanVitestFiles,
  isCoveredByProject,
  listVitestCandidates,
  NON_VITEST_TREES,
} from '../vitest-orphan-inventory.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('vitest orphan inventory', () => {
  it('runs from the structural script contract lane', () => {
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/vitest-orphan-inventory.test.mjs'
    );
  });

  it('keeps every non-Vitest exclusion reasoned', () => {
    for (const [prefix, reason] of Object.entries(NON_VITEST_TREES)) {
      expect(prefix.endsWith('/'), prefix).toBe(true);
      expect(reason.trim().length, prefix).toBeGreaterThan(20);
    }
  });

  it('does not treat the projects-only root config as coverage', () => {
    expect(coveringProjectRoots(['.', 'apps/web', 'scripts'])).toEqual([
      'apps/web',
    ]);
    expect(isCoveredByProject('tests/lib/example.test.ts', ['apps/web'])).toBe(
      false
    );
    expect(
      isCoveredByProject('apps/web/tests/lib/provider-links.test.ts', [
        'apps/web',
      ])
    ).toBe(true);
  });

  it('has no Vitest file outside a project root', () => {
    const { orphans, roots } = inventoryOrphanVitestFiles(REPO_ROOT);
    expect(roots).toContain('apps/web');
    expect(roots).toContain('packages/ui');
    expect(roots).not.toContain('.');
    expect(
      orphans,
      `Unwired: ${orphans.join(', ')}. Move each file under a Vitest project or delete it.`
    ).toEqual([]);
  });

  it('fails when a root tests/ file is added', () => {
    const files = [
      ...listVitestCandidates(REPO_ROOT),
      'tests/lib/zz-new-orphan.test.ts',
    ];
    const { orphans } = inventoryOrphanVitestFiles(REPO_ROOT, { files });
    expect(orphans).toContain('tests/lib/zz-new-orphan.test.ts');
  });

  it('ignores vendored and node:test trees', () => {
    const files = listVitestCandidates(REPO_ROOT);
    expect(files.some(file => file.startsWith('.agents/'))).toBe(false);
    expect(files.some(file => file.startsWith('.github/'))).toBe(false);
    expect(files.some(file => file.startsWith('scripts/'))).toBe(false);
    expect(files.some(file => file.includes('node_modules'))).toBe(false);
  });
});
