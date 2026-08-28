import { describe, expect, it } from 'vitest';
import {
  buildChangelogCollisionInventory,
  changelogCollisionDrainDecision,
  evaluatePreLandChangelogAdmission,
  PRE_LAND_CHANGELOG_PATH,
  PRE_LAND_CHANGELOG_SCHEMA,
  touchesPreLandChangelog,
} from '../pre-land-changelog.mjs';

describe('pre-land CHANGELOG admission (JOV-5378)', () => {
  it('rejects implementation diffs that add or edit CHANGELOG.md', () => {
    expect(PRE_LAND_CHANGELOG_PATH).toBe('CHANGELOG.md');
    expect(
      evaluatePreLandChangelogAdmission({
        changedFiles: ['CHANGELOG.md', 'scripts/foo.mjs'],
        branch: 'fallback/JOV-5378-fix',
      })
    ).toMatchObject({
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'reject',
      reason: 'pre-land-changelog',
      path: 'CHANGELOG.md',
    });
    expect(
      evaluatePreLandChangelogAdmission({
        changedFiles: ['CHANGELOG.md'],
      })
    ).toMatchObject({ action: 'reject', reason: 'pre-land-changelog' });
  });

  it('allows implementation diffs that omit CHANGELOG.md', () => {
    expect(
      evaluatePreLandChangelogAdmission({
        changedFiles: ['scripts/lib/pre-land-changelog.mjs'],
        branch: 'tim/jov-5378',
      })
    ).toMatchObject({ action: 'allow', reason: 'omits-changelog' });
    expect(touchesPreLandChangelog(['scripts/foo.mjs'])).toBe(false);
  });

  it('allows CHANGELOG.md on the stamp/release path', () => {
    expect(
      evaluatePreLandChangelogAdmission({
        changedFiles: ['CHANGELOG.md', 'VERSION'],
        branch: 'main',
      })
    ).toMatchObject({ action: 'allow', reason: 'stamp-path' });
    expect(
      evaluatePreLandChangelogAdmission({
        changedFiles: ['CHANGELOG.md'],
        branch: 'cursor/stamp-26-8-0-version-stamp-ab12',
      })
    ).toMatchObject({ action: 'allow', reason: 'stamp-path' });
  });

  it('does not mutate when changed-file evidence is missing', () => {
    expect(evaluatePreLandChangelogAdmission({})).toMatchObject({
      action: 'unknown',
      reason: 'changelog-evidence-unavailable',
    });
  });
});

describe('pre-land CHANGELOG collision inventory', () => {
  it('lists open implementation PRs that still carry CHANGELOG.md', () => {
    expect(
      buildChangelogCollisionInventory({
        openPrs: [
          {
            number: 16485,
            headRefName: 'fallback/JOV-5377-fix',
            files: [
              'CHANGELOG.md',
              'scripts/lib/__tests__/rolling-ci-dispatch.test.mjs',
            ],
            queued: true,
          },
          {
            number: 16484,
            head: 'codex/jov-5377-rolling-ci-payload',
            files: ['.github/workflows/rolling-ci-dispatch.yml'],
          },
          {
            number: 1,
            headRefName: 'main',
            files: ['CHANGELOG.md'],
            queued: false,
          },
          { number: 2, files: ['CHANGELOG.md'] },
        ],
      })
    ).toEqual({
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      ok: true,
      reason: 'explicit',
      count: 2,
      prs: [
        {
          number: 16485,
          headRefName: 'fallback/JOV-5377-fix',
          queued: true,
        },
        { number: 2, headRefName: null, queued: false },
      ],
    });
  });

  it('fails closed when the open-PR list is unavailable', () => {
    expect(buildChangelogCollisionInventory({})).toMatchObject({
      ok: false,
      reason: 'inventory-unavailable',
      prs: [],
      count: 0,
    });
  });
});

describe('pre-land CHANGELOG drain', () => {
  it('dequeues queued implementation CHANGELOG members without reenqueue', () => {
    expect(
      changelogCollisionDrainDecision({
        files: ['CHANGELOG.md'],
        queued: true,
        branch: 'fallback/JOV-5377-fix',
      })
    ).toEqual({
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'dequeue',
      reason: 'pre-land-changelog',
      reenqueue: false,
    });
  });

  it('skips enrollment for unqueued implementation CHANGELOG diffs', () => {
    expect(
      changelogCollisionDrainDecision({
        files: ['CHANGELOG.md'],
        queued: false,
        branch: 'tim/jov-1000',
      })
    ).toMatchObject({
      action: 'skip-enroll',
      reason: 'pre-land-changelog',
      reenqueue: false,
    });
  });

  it('keeps stamp-path and changelog-free heads', () => {
    expect(
      changelogCollisionDrainDecision({
        files: ['CHANGELOG.md'],
        queued: true,
        branch: 'release/2026-08-28',
      })
    ).toMatchObject({ action: 'keep', reason: 'stamp-path' });
    expect(
      changelogCollisionDrainDecision({
        files: ['scripts/foo.mjs'],
        queued: true,
        branch: 'tim/jov-1000',
      })
    ).toMatchObject({ action: 'keep', reason: 'omits-changelog' });
  });
});
