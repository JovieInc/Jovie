/**
 * JOV-3069: user_profile_claims must allow multiple roles per profile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/0061_user_profile_claims_unique_profile_role.sql'
);

describe('userProfileClaims unique index migration', () => {
  it('replaces single-column uniqueness with creator_profile_id + role', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

    expect(sql).toContain(
      'DROP INDEX IF EXISTS "idx_user_profile_claims_unique_profile"'
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profile_claims_unique_profile" ON "user_profile_claims" USING btree ("creator_profile_id", "role")'
    );
    expect(sql).not.toMatch(
      /CREATE UNIQUE INDEX[^;]*\("creator_profile_id"\)\s*;/
    );
  });
});
