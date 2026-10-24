import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRIPT_CONTRACT_VITEST_TESTS } from '../../ci-fast-lanes.mjs';
import {
  assertBaselineAllowlist,
  auditUiStoryCoverage,
  classifyUiPath,
  listComponentsMissingAdjacentStories,
  validateUiStoryCoveragePolicy,
} from '../../ui-story-coverage-policy.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Allowlist entries graduated in the JOV-8847 burn-down with an adjacent story. */
const GRADUATED_JOV_8847_COMPONENTS = [
  'apps/web/components/features/auth/ButtonSpinner.tsx',
  'apps/web/components/shell/ArtworkPlayOverlay.tsx',
  'apps/web/components/shell/DashboardSegmentSkeleton.tsx',
  'apps/web/components/shell/EntityThreadGlyph.tsx',
  'apps/web/components/shell/LoopBtn.tsx',
  'apps/web/components/shell/PlayingBars.tsx',
  'apps/web/components/shell/PriorityGlyph.tsx',
  'apps/web/components/shell/ShellLoader.tsx',
  'apps/web/components/shell/TaskStatusIcon.tsx',
];

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

  it('has an adjacent story for every graduated JOV-8847 entry', () => {
    for (const componentPath of GRADUATED_JOV_8847_COMPONENTS) {
      const storyPath = componentPath.replace(/\.tsx$/, '.stories.tsx');
      expect(
        existsSync(resolve(REPO_ROOT, storyPath)),
        `${storyPath} must exist`
      ).toBe(true);
    }
  });

  it('removed every graduated JOV-8847 entry from the allowlist', () => {
    const policy = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, '.github/ui-story-coverage-policy.json'),
        'utf8'
      )
    );
    const listed = new Set((policy.allowlist ?? []).map(entry => entry.path));
    for (const componentPath of GRADUATED_JOV_8847_COMPONENTS) {
      expect(
        listed.has(componentPath),
        `${componentPath} must no longer be allowlisted`
      ).toBe(false);
    }
  });

  it('graduated JOV-8847 components are no longer measured as uncovered', () => {
    const measured = new Set(listComponentsMissingAdjacentStories(REPO_ROOT));
    for (const componentPath of GRADUATED_JOV_8847_COMPONENTS) {
      expect(
        measured.has(componentPath),
        `${componentPath} must have an adjacent story`
      ).toBe(false);
    }
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
