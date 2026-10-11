import { describe, expect, it } from 'vitest';
import {
  type OnlineIndexArtifact,
  type QueryClient,
  runOnlineIndexMigrations,
} from '../../../scripts/online-index-migrate';

const artifact: OnlineIndexArtifact = {
  id: '202609270900_test_index',
  approvalIssue: 'JOV-6273',
  schema: 'public',
  index: 'events_created_at_idx',
  expectedDefinition:
    'CREATE INDEX events_created_at_idx ON public.events USING btree (created_at)',
};

class DatabaseHarness implements QueryClient {
  queries: string[] = [];
  index: { definition: string; valid: boolean } | null = null;
  failNextBuild = false;

  constructor(private readonly lockAvailable = true) {}

  async query<T = Record<string, unknown>>(
    text: string
  ): Promise<{ rows: T[] }> {
    this.queries.push(text);
    if (text.includes('pg_try_advisory_lock')) {
      return { rows: [{ locked: this.lockAvailable }] as T[] };
    }
    if (text.includes('pg_get_indexdef')) {
      return { rows: (this.index ? [this.index] : []) as T[] };
    }
    if (text.startsWith('SELECT checksum')) return { rows: [] };
    if (text.startsWith('DROP INDEX CONCURRENTLY')) this.index = null;
    if (text.startsWith('CREATE INDEX CONCURRENTLY')) {
      this.index = {
        definition: text.replace(
          /^CREATE INDEX CONCURRENTLY /,
          'CREATE INDEX '
        ),
        valid: !this.failNextBuild,
      };
      if (this.failNextBuild) {
        this.failNextBuild = false;
        throw new Error('canceling statement due to statement timeout');
      }
    }
    return { rows: [] };
  }
}

describe('online index migrations', () => {
  it('rejects unique indexes from the performance-only path', async () => {
    const db = new DatabaseHarness();

    await expect(
      runOnlineIndexMigrations(db, [
        {
          ...artifact,
          expectedDefinition:
            'CREATE UNIQUE INDEX events_created_at_idx ON public.events USING btree (created_at)',
        },
      ])
    ).rejects.toThrow('not a certifiable index definition');
    expect(db.queries.some(query => query.startsWith('CREATE INDEX'))).toBe(
      false
    );
  });

  it('preserves whitespace inside SQL literals', async () => {
    const db = new DatabaseHarness();
    const spacedLiteralArtifact = {
      ...artifact,
      expectedDefinition:
        "CREATE INDEX events_created_at_idx ON public.events USING btree (created_at) WHERE (slug = 'a  b'::text)",
    };

    await runOnlineIndexMigrations(db, [spacedLiteralArtifact]);

    expect(db.index?.definition).toBe(spacedLiteralArtifact.expectedDefinition);
  });

  it('fails before DDL when another runner owns the migration lock', async () => {
    const db = new DatabaseHarness(false);

    await expect(runOnlineIndexMigrations(db, [artifact])).rejects.toThrow(
      'owns the DDL advisory lock'
    );
    expect(db.queries.some(query => query.startsWith('CREATE INDEX'))).toBe(
      false
    );
  });

  it('recovers an invalid index left by interruption and records the rerun', async () => {
    const db = new DatabaseHarness();
    db.failNextBuild = true;

    await expect(runOnlineIndexMigrations(db, [artifact])).rejects.toThrow(
      'statement timeout'
    );
    expect(db.index?.valid).toBe(false);

    await runOnlineIndexMigrations(db, [artifact]);

    expect(
      db.queries.filter(query => query.startsWith('DROP INDEX CONCURRENTLY'))
    ).toHaveLength(1);
    expect(
      db.queries.filter(query => query.startsWith('CREATE INDEX CONCURRENTLY'))
    ).toHaveLength(2);
    expect(
      db.queries.some(query =>
        query.includes('INSERT INTO drizzle.__jovie_online_index_migrations')
      )
    ).toBe(true);
    expect(db.index?.valid).toBe(true);
  });

  it('certifies a valid rerun without rebuilding the index', async () => {
    const db = new DatabaseHarness();
    db.index = { definition: artifact.expectedDefinition, valid: true };

    await runOnlineIndexMigrations(db, [artifact]);

    expect(
      db.queries.some(query => query.startsWith('CREATE INDEX CONCURRENTLY'))
    ).toBe(false);
    expect(
      db.queries.some(query =>
        query.includes('INSERT INTO drizzle.__jovie_online_index_migrations')
      )
    ).toBe(true);
  });

  it('builds on an empty table path and rejects same-name definition drift', async () => {
    const emptyDb = new DatabaseHarness();
    await runOnlineIndexMigrations(emptyDb, [artifact]);
    expect(emptyDb.index?.valid).toBe(true);

    const driftedDb = new DatabaseHarness();
    driftedDb.index = {
      definition:
        'CREATE INDEX events_created_at_idx ON public.events USING btree (id)',
      valid: true,
    };
    await expect(
      runOnlineIndexMigrations(driftedDb, [artifact])
    ).rejects.toThrow('does not match the artifact');
  });
});
