import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const graphMigration = join(
  process.cwd(),
  'drizzle/migrations/0096_petite_doomsday.sql'
);
const exceptionMigration = join(
  process.cwd(),
  'drizzle/migrations/0097_regular_mister_sinister.sql'
);
describe('library graph private migrations', () => {
  it('forces row-level security on every creator graph table', async () => {
    const sql = await readFile(graphMigration, 'utf8');
    for (const table of [
      'artist_rule_events',
      'artist_rules',
      'creator_brands',
      'creator_offers',
      'library_relationships',
      'optimization_experiments',
      'youtube_videos',
      'youtube_thumbnail_versions',
      'youtube_video_metric_snapshots',
      'youtube_video_release_links',
    ]) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`${table}_owner_bridge`);
    }
  });

  it('keeps thumbnail identity append-only with explicit lifecycle transitions', async () => {
    const sql = await readFile(graphMigration, 'utf8');
    expect(sql).toContain('youtube_thumbnail_version_history_guard');
    expect(sql).toContain('youtube thumbnail history is append-only');
    expect(sql).toContain('youtube thumbnail version identity is immutable');
    expect(sql).toContain('invalid youtube thumbnail lifecycle transition');
    expect(sql).toContain("OLD.kind = 'candidate' AND NEW.kind = 'current'");
  });

  it('keeps rule events immutable and records status transitions', async () => {
    const sql = await readFile(graphMigration, 'utf8');
    expect(sql).toContain('artist_rule_event_immutable_guard');
    expect(sql).toContain('artist rule events are immutable');
    expect(sql).toContain('artist_rule_status_event');
    expect(sql).toContain("'activated'::artist_rule_event_type");
    expect(sql).toContain("'revoked'::artist_rule_event_type");
  });

  it('rejects forbidden overrides and audits accepted exceptions', async () => {
    const sql = await readFile(exceptionMigration, 'utf8');
    expect(sql).toContain(
      'ALTER TABLE "artist_rule_exceptions" FORCE ROW LEVEL SECURITY'
    );
    expect(sql).toContain('artist_rule_exception_guard');
    expect(sql).toContain('artist rule does not allow overrides');
    expect(sql).toContain('only active artist rules can be overridden');
    expect(sql).toContain('artist_rule_exception_event');
    expect(sql).toContain("'exception_granted'::artist_rule_event_type");
  });
});
