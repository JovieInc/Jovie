import { describe, expect, test } from 'vitest';

import { planMigrationExecution } from '../../scripts/drizzle-migrate';

const makeMigration = (tag: string, folderMillis: number) => ({
  tag,
  sql: ['select 1;'],
  folderMillis,
  hash: `${tag}-hash`,
});

describe('planMigrationExecution', () => {
  test('returns noop when there are no pending migrations', () => {
    expect(planMigrationExecution([])).toEqual({
      mode: 'noop',
      boundaryMigrations: [],
      remainingCount: 0,
    });
  });

  test('uses normal batching when no boundary migration is pending', () => {
    expect(
      planMigrationExecution([
        makeMigration('0075_add_audience_attribution_source', 75),
        makeMigration('0076_add_investor_portal', 76),
      ])
    ).toEqual({
      mode: 'batch',
      boundaryMigrations: [],
      remainingCount: 2,
    });
  });

  test('splits at the explicit boundary and keeps later migrations batched', () => {
    const boundary = makeMigration(
      '0078_add_recordings_and_release_tracks',
      78
    );

    expect(
      planMigrationExecution([
        makeMigration('0075_add_audience_attribution_source', 75),
        boundary,
        makeMigration('0079_backfill_recordings_from_tracks', 79),
      ])
    ).toEqual({
      mode: 'boundary-then-batch',
      boundaryMigrations: [
        makeMigration('0075_add_audience_attribution_source', 75),
        boundary,
      ],
      remainingCount: 1,
    });
  });

  test('uses individual execution only through the boundary when it is last', () => {
    const boundary = makeMigration(
      '0078_add_recordings_and_release_tracks',
      78
    );

    expect(
      planMigrationExecution([
        makeMigration('0077_release_tasks', 77),
        boundary,
      ])
    ).toEqual({
      mode: 'boundary-only',
      boundaryMigrations: [makeMigration('0077_release_tasks', 77), boundary],
      remainingCount: 0,
    });
  });
});
