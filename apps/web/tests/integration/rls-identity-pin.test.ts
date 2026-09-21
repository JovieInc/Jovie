import { Pool } from '@neondatabase/serverless';
/* eslint-disable @jovie/no-manual-db-pooling -- Distinct pooled clients for identity-bleed proof */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupDatabase } from '../setup-db';

const databaseUrl = process.env.DATABASE_URL;
const describeRlsPin = databaseUrl ? describe : describe.skip;

describeRlsPin('RLS identity pin on real Postgres (JOV-6267)', () => {
  let pool: Pool;

  beforeAll(async () => {
    await setupDatabase();
    pool = new Pool({ connectionString: databaseUrl, max: 3 });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
  });

  async function readIdentity(client: {
    query: (sql: string) => Promise<{ rows: Array<{ clerk_user_id: string }> }>;
  }) {
    const result = await client.query(
      "SELECT current_setting('app.clerk_user_id', true) AS clerk_user_id"
    );
    return result.rows[0]?.clerk_user_id ?? '';
  }

  it('records runtime owner/BYPASSRLS/FORCE without claiming production enforcement', async () => {
    const client = await pool.connect();
    try {
      const role = await client.query(`
        SELECT current_user, r.rolbypassrls, r.rolsuper
        FROM pg_roles r WHERE r.rolname = current_user
      `);
      const tables = await client.query(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname IN ('users','creator_profiles','user_profile_claims')
      `);
      expect(typeof role.rows[0]?.rolbypassrls).toBe('boolean');
      expect(tables.rows.length).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  it('unpinned identity survives COMMIT; pinned identity does not leak across users', async () => {
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      await clientA.query("SELECT set_config('app.clerk_user_id', $1, false)", [
        'user-unpinned-a',
      ]);
      await clientA.query('COMMIT');
      expect(await readIdentity(clientA)).toBe('user-unpinned-a');
      await clientA.query("SELECT set_config('app.clerk_user_id', '', false)");

      await clientA.query('BEGIN');
      await clientB.query('BEGIN');
      await clientA.query("SELECT set_config('app.clerk_user_id', $1, true)", [
        'user-pinned-a',
      ]);
      await clientB.query("SELECT set_config('app.clerk_user_id', $1, true)", [
        'user-pinned-b',
      ]);
      expect(await readIdentity(clientA)).toBe('user-pinned-a');
      expect(await readIdentity(clientB)).toBe('user-pinned-b');
      await clientA.query('ROLLBACK');
      await clientB.query('ROLLBACK');
      expect(await readIdentity(clientA)).not.toBe('user-pinned-a');
      expect(await readIdentity(clientB)).not.toBe('user-pinned-b');
    } finally {
      clientA.release();
      clientB.release();
    }
  });
});
