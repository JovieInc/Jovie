import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRIPT_CONTRACT_VITEST_TESTS } from '../../ci-fast-lanes.mjs';
import {
  assertBaselineAllowlist,
  auditUiStoryCoverage,
  classifyUiPath,
  validateUiStoryCoveragePolicy,
} from '../../ui-story-coverage-policy.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('ui story coverage policy', () => {
  it('runs from the structural script contract lane', () => {
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/ui-story-coverage-policy.test.mjs'
    );
  });

  it('matches the measured baseline and maps every entry to JOV-8847', () => {
    const policy = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, '.github/ui-story-coverage-policy.json'),
        'utf8'
      )
    );
    const measured = assertBaselineAllowlist(REPO_ROOT, policy);
    expect(measured.length).toBeGreaterThan(0);
    expect(policy.mode).toBe('blocking');
    expect(policy.verifiedCleanRunIds).toEqual([
      39795196291, 39796515081, 39868623309, 39873145141, 39884653800,
    ]);
    expect(
      policy.allowlist.every(entry => entry.linearIssue === 'JOV-8847')
    ).toBe(true);
  });

  it('rejects an allowlist entry that is not a component with a Linear id', () => {
    expect(() =>
      validateUiStoryCoveragePolicy({
        schemaVersion: 1,
        owner: 'Gem',
        mode: 'audit',
        cleanBaselineRunsRequired: 5,
        verifiedCleanRunIds: [],
        blockingAfter: null,
        minimumPullRequestNumber: null,
        allowlist: [
          {
            path: 'apps/web/app/page.tsx',
            linearIssue: 'JOV-8847',
          },
        ],
      })
    ).toThrow('Malformed UI story coverage allowlist');
  });

  it('does not treat the removed Chromatic config as audit harness', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'scripts/ui-story-coverage-policy.mjs'),
      'utf8'
    );
    expect(source).not.toContain('chromatic.config.json');
    expect(classifyUiPath('chromatic.config.json')).toBeNull();
  });

  it('does not let an allowlist entry hide a changed route surface', () => {
    const result = auditUiStoryCoverage({
      root: REPO_ROOT,
      changedFiles: ['apps/web/app/example/page.tsx'],
      allowlist: [
        {
          path: 'apps/web/app/example/page.tsx',
          linearIssue: 'JOV-8847',
        },
      ],
    });
    expect(result.issues).toContainEqual({
      path: 'apps/web/app/example/page.tsx',
      reason:
        'changed route surface has no Storybook or Playwright visual evidence in this change',
    });
  });
});
