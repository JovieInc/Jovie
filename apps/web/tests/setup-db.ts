import { neonConfig, Pool } from '@neondatabase/serverless';
/* eslint-disable no-restricted-imports, @jovie/no-manual-db-pooling -- Test requires full schema access and pooling for WebSocket driver */
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
    await db.execute(
      'ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS discovered_pixels jsonb'
    );
    await db.execute(
      'ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS discovered_pixels_at timestamp'
    );
    // RLS enablement + policies come from the real Drizzle migrations
    // (0001, 0036, 0075) applied above — tests must assert against the
    // deployed policies, never test-authored copies (GH #13931).
    // FORCE ROW LEVEL SECURITY is intentionally NOT applied here: fixture
    // setup runs as the table-owner role, and RLS enforcement in tests is
    // exercised through the NOBYPASSRLS `test_app_user` role instead —
    // matching the production posture (ENABLE, owner exempt).
    await db.execute('SET row_security = on;');

    await setupRlsTestRole(db);

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
 * Create test_app_user role without BYPASSRLS for RLS enforcement testing.
 */
async function setupRlsTestRole(db: NeonDatabase<typeof schema>) {
  await db.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
        CREATE ROLE test_app_user WITH LOGIN NOINHERIT NOBYPASSRLS;
      END IF;
      -- SET ROLE requires membership; grant it to the connecting (owner) role.
      GRANT test_app_user TO CURRENT_USER;
      GRANT USAGE ON SCHEMA public TO test_app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_app_user;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO test_app_user;
      ALTER ROLE test_app_user SET row_security = on;
    END $$;
  `);
}

/** Transaction type for RLS test operations */
type RlsTransactionType = Parameters<
  Parameters<NeonDatabase<typeof schema>['transaction']>[0]
>[0];

/**
 * Execute a database operation as a specific user with RLS enforced.
 * Uses SET LOCAL ROLE to switch to non-bypass role within the transaction.
 *
 * `appUserId` is the app `users.id` UUID — the value the app writes into the
 * `app.clerk_user_id` session variable post Better-Auth cutover
 * (see lib/auth/session.ts and migration 0075).
 */
export async function withRlsUser<T>(
  appUserId: string,
  operation: (tx: RlsTransactionType) => Promise<T>
): Promise<T> {
  if (!db) {
    throw new Error('Database not initialized for RLS testing');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(appUserId)) {
    throw new Error('withRlsUser: unsafe appUserId');
  }

  return db.transaction(async tx => {
    await tx.execute('SET LOCAL ROLE test_app_user');
    await tx.execute(
      `SELECT set_config('app.clerk_user_id', '${appUserId}', true)`
    );
    return operation(tx);
  });
}

/**
 * Execute a database operation anonymously (no user context) with RLS enforced.
 */
export async function withRlsAnonymous<T>(
  operation: (tx: RlsTransactionType) => Promise<T>
): Promise<T> {
  if (!db) {
    throw new Error('Database not initialized for RLS testing');
  }

  return db.transaction(async tx => {
    await tx.execute('SET LOCAL ROLE test_app_user');
    await tx.execute(`SELECT set_config('app.clerk_user_id', '', true)`);
    return operation(tx);
  });
}

/**
 * Helper for integration tests to use in beforeAll.
 */
export function setupDatabaseBeforeAll() {
  beforeAll(async () => {
    await setupDatabase();
  });
}

export { db };
