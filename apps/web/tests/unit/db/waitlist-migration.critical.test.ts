import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WAITLIST_MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../drizzle/migrations/0043_harden_waitlist_onboarding.sql'
);

function loadWaitlistMigration(): string {
  return fs.readFileSync(WAITLIST_MIGRATION_PATH, 'utf-8');
}

describe('waitlist hardening migration', () => {
  it('preserves existing approval states when canonicalizing duplicate emails', () => {
    const migration = loadWaitlistMigration();
    const rankedEntriesBlock = migration.match(
      /WITH ranked_entries AS \([\s\S]+?\)\nUPDATE "waitlist_entries"/
    )?.[0];

    expect(rankedEntriesBlock).toBeDefined();
    const block = rankedEntriesBlock ?? '';
    const statusRanks = new Map(
      [...block.matchAll(/WHEN '([^']+)' THEN (\d+)/g)].map(
        ([, status, rank]) => [status, Number(rank)]
      )
    );

    expect(block.indexOf('CASE "status"::text')).toBeLessThan(
      block.indexOf('"created_at" DESC')
    );
    expect(statusRanks.get('claimed')).toBeGreaterThan(
      statusRanks.get('new') ?? 0
    );
    expect(statusRanks.get('signed_up')).toBeGreaterThan(
      statusRanks.get('new') ?? 0
    );
    expect(statusRanks.get('approved')).toBeGreaterThan(
      statusRanks.get('waitlisted') ?? 0
    );
    expect(statusRanks.get('invited')).toBeGreaterThan(
      statusRanks.get('waitlisted') ?? 0
    );
    expect(statusRanks.get('blocked')).toBeGreaterThan(
      statusRanks.get('waitlisted') ?? 0
    );
    expect(statusRanks.get('rejected')).toBeGreaterThan(
      statusRanks.get('waitlisted') ?? 0
    );
  });
});
