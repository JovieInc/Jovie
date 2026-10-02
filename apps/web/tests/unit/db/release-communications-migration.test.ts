import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/0101_canonical_release_communications.sql'
);

function loadMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, 'utf-8');
}

describe('release communications migration idempotency', () => {
  it('records every merge event exactly once via a unique event key', () => {
    const migration = loadMigration();
    expect(migration).toContain('"release_merge_events"');
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[^;]*"release_merge_events_event_key_unique"[^;]*\("event_key"\)/
    );
  });

  it('pins one rolling post per product/app/local day', () => {
    const migration = loadMigration();
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[^;]*"release_daily_posts_identity_unique"[^;]*\("product",\s*"app",\s*"local_date"\)/
    );
  });

  it('keeps dismissal to one record per user per post', () => {
    const migration = loadMigration();
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[^;]*"release_daily_post_dismissals_user_post_unique"[^;]*\("post_id",\s*"user_id"\)/
    );
  });

  it('stores explicit materiality and audience eligibility per entry', () => {
    const migration = loadMigration();
    expect(migration).toMatch(/"material" boolean NOT NULL/);
    expect(migration).toMatch(/"audience_eligible" boolean NOT NULL/);
  });
});
