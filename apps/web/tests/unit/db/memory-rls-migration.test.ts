import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'drizzle/migrations/0077_memory_rls.sql'),
  'utf8'
);

const MEMORY_TABLES = [
  'memory_assets',
  'memory_enrichment_jobs',
  'memory_entities',
  'memory_entity_edges',
  'memory_events',
  'memory_observations',
  'memory_opportunities',
  'memory_source_records',
  'memory_asset_entity_mentions',
  'memory_entity_aliases',
  'memory_entity_identities',
  'memory_event_participants',
] as const;

describe('memory RLS migration', () => {
  it('enables isolation for every memory table', () => {
    for (const table of MEMORY_TABLES) {
      expect(migration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`
      );
      expect(migration).toContain(`ON "${table}"`);
    }
  });

  it('resolves both Better Auth app UUIDs and legacy Clerk IDs', () => {
    expect(migration).toContain(
      "u.id::text = NULLIF(current_setting('app.clerk_user_id'"
    );
    expect(migration).toContain(
      "u.clerk_id = NULLIF(current_setting('app.clerk_user_id'"
    );
    expect(migration).toContain('SECURITY DEFINER');
  });
});
