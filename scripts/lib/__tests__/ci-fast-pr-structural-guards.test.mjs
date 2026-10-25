import { describe, expect, it } from 'vitest';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';

const ids = (event, files) =>
  selectSourceGuards(event, files).map(guard => guard.id);

// Merge-group ejections 2026-10-23..25: these structural-lane tests never ran
// on the source PR. They must now run on PRs that touch their inputs only.
describe('PR-time structural guards', () => {
  it('runs the release lineage tests when a promotion module changes', () => {
    expect(
      ids('pull_request', ['scripts/lib/promotion-journey-evidence.mjs'])
    ).toContain('release-lineage-contracts');
    expect(
      ids('pull_request', ['scripts/lib/ci-schedule-inventory.mjs'])
    ).not.toContain('release-lineage-contracts');
  });

  it('runs the UI story allowlist test for component changes', () => {
    expect(
      ids('pull_request', ['apps/web/components/atoms/Foo.tsx'])
    ).toContain('ui-story-coverage-allowlist');
    expect(ids('pull_request', ['apps/web/lib/foo.ts'])).not.toContain(
      'ui-story-coverage-allowlist'
    );
  });

  it('leaves merge groups to the structural lane', () => {
    const merge = ids('merge_group', ['apps/web/components/atoms/Foo.tsx']);
    expect(merge).not.toContain('ui-story-coverage-allowlist');
    expect(merge).not.toContain('release-lineage-contracts');
  });

  it('runs the design-surfaces invariant merged with base for nav data changes', () => {
    expect(
      ids('pull_request', ['apps/web/data/marketingNavigation.ts'])
    ).toContain('design-surfaces-merged-with-base');
    expect(ids('pull_request', ['apps/web/lib/foo.ts'])).not.toContain(
      'design-surfaces-merged-with-base'
    );
    expect(
      ids('merge_group', ['apps/web/data/marketingNavigation.ts'])
    ).not.toContain('design-surfaces-merged-with-base');
  });
});
