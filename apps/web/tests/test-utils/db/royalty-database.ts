import { readFileSync } from 'node:fs';
import type { DbType } from '@/lib/db';

/** Hosted certification uses Neon; loopback is an explicitly disposable DB only. */
export async function setupRoyaltyDatabase(): Promise<{
  db: DbType;
  close: () => Promise<void>;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for royalty integration');
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    const { setupDatabase } = await import('../../setup-db');
    const db = await setupDatabase();
    if (!db) throw new Error('Integration database unavailable');
    return { db: db as DbType, close: async () => {} };
  }
  if (parsed.pathname !== '/jov8431_test')
    throw new Error('Disposable royalty database required');
  const [{ default: postgres }, { drizzle }] = await Promise.all([
    import('postgres'),
    import('drizzle-orm/postgres-js'),
  ]);
  const client = postgres(url, { max: 2, onnotice: () => {} });
  try {
    await client.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const journal = JSON.parse(
      readFileSync('drizzle/migrations/meta/_journal.json', 'utf8')
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      const statements = readFileSync(
        `drizzle/migrations/${tag}.sql`,
        'utf8'
      ).split('--> statement-breakpoint');
      await client.begin(async tx => {
        for (const statement of statements)
          if (statement.trim()) await tx.unsafe(statement);
      });
    }
    await client.unsafe(`
      DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
        CREATE ROLE test_app_user NOLOGIN NOBYPASSRLS;
      END IF; END $$;
      GRANT USAGE ON SCHEMA public TO test_app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_app_user;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO test_app_user;
    `);
    return {
      db: drizzle(client) as unknown as DbType,
      close: () => client.end(),
    };
  } catch (error) {
    await client.end();
    throw error;
  }
}
