// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildLeadBuildHold,
  isLeadBuildHeld,
  withLeadBuildHold,
  withLeadBuildRelease,
} from './lead-build-hold';

describe('lead build hold', () => {
  it('holds a lead-built profile and keeps other settings', () => {
    const settings = withLeadBuildHold({ theme: 'x' }, new Date(0));
    expect(settings.theme).toBe('x');
    expect(isLeadBuildHeld(settings)).toBe(true);
    expect(buildLeadBuildHold(new Date(0)).heldAt).toBe(
      '1970-01-01T00:00:00.000Z'
    );
  });

  it('fails closed on malformed settings only by not holding what was never built by a lead', () => {
    expect(isLeadBuildHeld(null)).toBe(false);
    expect(isLeadBuildHeld({})).toBe(false);
    expect(isLeadBuildHeld({ leadBuild: 'x' })).toBe(false);
    expect(isLeadBuildHeld({ leadBuild: { held: true } })).toBe(true);
  });

  it('release lifts the hold', () => {
    const released = withLeadBuildRelease(withLeadBuildHold({}));
    expect(isLeadBuildHeld(released)).toBe(false);
  });
});

describe('migration 0162 guard', () => {
  it('keeps the trigger and the live backfill', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          '../../drizzle/migrations/0162_lead_build_hold.sql',
          import.meta.url
        )
      ),
      'utf8'
    );
    expect(sql).toContain('creator_profiles_lead_build_hold');
    expect(sql).toContain('NEW."is_public" := false');
    expect(sql).toMatch(/UPDATE "creator_profiles"[\s\S]*FROM "leads"/);
  });
});
