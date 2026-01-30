import { neonConfig, Pool } from '@neondatabase/serverless';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import path from 'path';
import { beforeAll } from 'vitest';
import ws from 'ws';
import type { DbType } from '@/lib/db';
import * as schema from '@/lib/db/schema';

// Configure WebSocket for transaction support in tests
// Tests use WebSocket driver (not HTTP) for proper transaction support during migrations
neonConfig.webSocketConstructor = ws;

let dbSetupComplete = false;
// Tests use WebSocket driver internally for transaction support
let db: NeonDatabase<typeof schema> | null = null;

/**
 * Setup database for integration tests.
 * This is lazy-loaded - only runs when explicitly called by integration tests.
 * Unit tests should NOT call this function.
 */
export async function setupDatabase() {
  // Only setup once per test suite
  if (dbSetupComplete) {
    return db;
  }

  if (process.env.NODE_ENV !== 'test') {
    return null;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('DATABASE_URL is not set. Database tests will be skipped.');
    return null;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  db = drizzle(pool, { schema });

  try {
    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
    try {
      await migrate(db, { migrationsFolder });
    } catch (error) {
      console.warn('Migration failed, continuing with existing schema:', error);
    }

    await db.execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status') THEN
          CREATE TYPE ingestion_status AS ENUM ('idle', 'pending', 'processing', 'failed');
        END IF;
      END $$;
    `);

    await db.execute(
      'ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS avatar_locked_by_user boolean NOT NULL DEFAULT false'
    );
    await db.execute(
      'ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS display_name_locked boolean NOT NULL DEFAULT false'
    );
    await db.execute(
      "ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS ingestion_status ingestion_status NOT NULL DEFAULT 'idle'"
    );
    await db.execute('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE users FORCE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE creator_profiles FORCE ROW LEVEL SECURITY');

    // Enable RLS enforcement
    await db.execute('SET row_security = on;');

    // Make db available globally for tests
    // Cast to DbType for compatibility - tests use WebSocket driver for transaction support
    globalThis.db = db as unknown as DbType;
    dbSetupComplete = true;

    return db;
  } catch (error) {
    console.error('Failed to run migrations:', error);
    throw error;
  }
}

/**
 * Helper for integration tests to use in beforeAll.
 * Usage: setupDatabaseBeforeAll() at the top of your test file.
 */
export function setupDatabaseBeforeAll() {
  beforeAll(async () => {
    await setupDatabase();
  });
}

export { db };
