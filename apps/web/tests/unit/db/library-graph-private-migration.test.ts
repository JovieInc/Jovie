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
const thumbnailPolicyMigration = join(
  process.cwd(),
  'drizzle/migrations/0099_youtube_thumbnail_versions_uuid_policy.sql'
);
const snapshot = join(
  process.cwd(),
  'drizzle/migrations/meta/0097_snapshot.json'
);
const schemaModule = join(
  process.cwd(),
  'lib/db/schema/library-content-graph.ts'
);

describe('library graph private migrations', () => {
  it('defines typed Drizzle schema for every private graph table', async () => {
    const schema = await readFile(schemaModule, 'utf8');
    const snapshotJson = JSON.parse(await readFile(snapshot, 'utf8'));
    for (const [tableName, exportName] of [
      ['artist_rule_events', 'artistRuleEvents'],
      ['artist_rules', 'artistRules'],
      ['creator_brands', 'creatorBrands'],
      ['creator_offers', 'creatorOffers'],
      ['library_relationships', 'libraryRelationships'],
      ['optimization_experiments', 'optimizationExperiments'],
      ['artist_rule_exceptions', 'artistRuleExceptions'],
    ] as const) {
      expect(schema).toContain(`export const ${exportName} = pgTable(`);
      expect(schema).toContain(`'${tableName}'`);
      expect(snapshotJson.tables[`public.${tableName}`]).toBeDefined();
    }
  });

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

  it('keeps creator offers linked to audience source links', async () => {
    const sql = await readFile(graphMigration, 'utf8');
    const snapshotJson = JSON.parse(await readFile(snapshot, 'utf8'));
    const offerForeignKeys =
      snapshotJson.tables['public.creator_offers'].foreignKeys;
    expect(sql).toContain(
      'creator_offers_source_link_id_audience_source_links_id_fk'
    );
    expect(
      offerForeignKeys.creator_offers_source_link_id_audience_source_links_id_fk
    ).toMatchObject({
      tableFrom: 'creator_offers',
      tableTo: 'audience_source_links',
      columnsFrom: ['source_link_id'],
      columnsTo: ['id'],
      onDelete: 'set null',
    });
  });

  it('keeps thumbnail identity append-only with explicit lifecycle transitions', async () => {
    const sql = await readFile(graphMigration, 'utf8');
    expect(sql).toContain('youtube_thumbnail_version_history_guard');
    expect(sql).toContain('youtube thumbnail history is append-only');
    expect(sql).toContain('youtube thumbnail version identity is immutable');
    expect(sql).toContain('invalid youtube thumbnail lifecycle transition');
    expect(sql).toContain("OLD.kind = 'candidate' AND NEW.kind = 'current'");
    expect(sql).toContain(
      'SELECT 1 FROM youtube_videos v WHERE v.id = OLD.video_id'
    );
    expect(sql).toContain(
      'WHERE v.id = "youtube_thumbnail_versions"."video_id"'
    );
    expect(sql).not.toContain(
      "OR (OLD.kind = 'previous' AND NEW.kind = 'current')"
    );
    expect(sql).not.toContain('WHERE v.id = video_id');
  });

  it('keeps rule events immutable and records status transitions', async () => {
    const sql = await readFile(graphMigration, 'utf8');
    expect(sql).toContain('artist_rule_event_immutable_guard');
    expect(sql).toContain('artist rule events are immutable');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM artist_rules r');
    expect(sql).toContain('artist_rule_lifecycle_guard');
    expect(sql).toContain('terminal artist rules cannot be reactivated');
    expect(sql).toContain('artist rule content is immutable after activation');
    expect(sql).toContain('artist_rule_status_event');
    expect(sql).toContain('v_actor_user_id := current_app_user_uuid();');
    expect(sql).toContain('artist rule status transition actor is required');
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
    expect(sql).toContain('artist_rule_exception_immutable_guard');
    expect(sql).toContain('artist rule exceptions are immutable');
    expect(sql).toContain('artist_rule_exception_event');
    expect(sql).toContain("'exception_granted'::artist_rule_event_type");
  });

  it('compares youtube thumbnail version video ids as uuid on both sides', async () => {
    const sql = await readFile(thumbnailPolicyMigration, 'utf8');
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "youtube_thumbnail_versions_private_access" ON "youtube_thumbnail_versions"'
    );
    expect(sql).toContain(
      'v.id::uuid = "youtube_thumbnail_versions"."video_id"::uuid'
    );
    expect(sql).not.toContain('WHERE v.id = video_id');
    expect(sql).not.toContain(
      'WHERE v.id = "youtube_thumbnail_versions"."video_id" AND'
    );
  });
});
