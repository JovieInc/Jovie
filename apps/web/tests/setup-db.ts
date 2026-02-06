import { neonConfig, Pool } from '@neondatabase/serverless';
/* eslint-disable no-restricted-imports, @jovie/no-manual-db-pooling, @jovie/no-db-transaction -- Test requires full schema access, pooling for WebSocket driver, and transactions for RLS testing */
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
    await db.execute('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE users FORCE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE creator_profiles FORCE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY');
    await db.execute('ALTER TABLE profile_photos FORCE ROW LEVEL SECURITY');

    await db.execute('SET row_security = on;');

    await setupRlsPolicies(db);
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
 * Setup RLS policies for testing.
 * Policies use current_setting('app.clerk_user_id', true) to identify the current user.
 */
async function setupRlsPolicies(db: NeonDatabase<typeof schema>) {
  // Drop existing policies (idempotent)
  await db.execute(`
    DO $$
    BEGIN
      DROP POLICY IF EXISTS "creator_profiles_select_public" ON creator_profiles;
      DROP POLICY IF EXISTS "creator_profiles_select_owner" ON creator_profiles;
      DROP POLICY IF EXISTS "creator_profiles_update_owner" ON creator_profiles;
      DROP POLICY IF EXISTS "creator_profiles_insert_owner" ON creator_profiles;
      DROP POLICY IF EXISTS "creator_profiles_delete_owner" ON creator_profiles;
      DROP POLICY IF EXISTS "profile_photos_select_public" ON profile_photos;
      DROP POLICY IF EXISTS "profile_photos_select_owner" ON profile_photos;
      DROP POLICY IF EXISTS "profile_photos_update_owner" ON profile_photos;
      DROP POLICY IF EXISTS "profile_photos_insert_owner" ON profile_photos;
      DROP POLICY IF EXISTS "profile_photos_delete_owner" ON profile_photos;
      DROP POLICY IF EXISTS "users_select_self" ON users;
      DROP POLICY IF EXISTS "users_update_self" ON users;
    END $$;
  `);

  // creator_profiles policies
  await db.execute(`
    CREATE POLICY "creator_profiles_select_public" ON creator_profiles
    FOR SELECT USING (is_public = true)
  `);

  await db.execute(`
    CREATE POLICY "creator_profiles_select_owner" ON creator_profiles
    FOR SELECT USING (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  await db.execute(`
    CREATE POLICY "creator_profiles_update_owner" ON creator_profiles
    FOR UPDATE USING (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  await db.execute(`
    CREATE POLICY "creator_profiles_insert_owner" ON creator_profiles
    FOR INSERT WITH CHECK (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
      OR user_id IS NULL
    )
  `);

  await db.execute(`
    CREATE POLICY "creator_profiles_delete_owner" ON creator_profiles
    FOR DELETE USING (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  // profile_photos policies
  await db.execute(`
    CREATE POLICY "profile_photos_select_public" ON profile_photos
    FOR SELECT USING (
      creator_profile_id IN (SELECT id FROM creator_profiles WHERE is_public = true)
    )
  `);

  await db.execute(`
    CREATE POLICY "profile_photos_select_owner" ON profile_photos
    FOR SELECT USING (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  await db.execute(`
    CREATE POLICY "profile_photos_update_owner" ON profile_photos
    FOR UPDATE USING (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  await db.execute(`
    CREATE POLICY "profile_photos_insert_owner" ON profile_photos
    FOR INSERT WITH CHECK (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  await db.execute(`
    CREATE POLICY "profile_photos_delete_owner" ON profile_photos
    FOR DELETE USING (
      user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_user_id', true))
    )
  `);

  // users policies
  await db.execute(`
    CREATE POLICY "users_select_self" ON users
    FOR SELECT USING (clerk_id = current_setting('app.clerk_user_id', true))
  `);

  await db.execute(`
    CREATE POLICY "users_update_self" ON users
    FOR UPDATE USING (clerk_id = current_setting('app.clerk_user_id', true))
  `);
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
 */
export async function withRlsUser<T>(
  clerkUserId: string,
  operation: (tx: RlsTransactionType) => Promise<T>
): Promise<T> {
  if (!db) {
    throw new Error('Database not initialized for RLS testing');
  }

  return db.transaction(async tx => {
    await tx.execute('SET LOCAL ROLE test_app_user');
    await tx.execute(
      `SELECT set_config('app.clerk_user_id', '${clerkUserId}', true)`
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
