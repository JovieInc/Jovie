import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '../lib/env-server';

/**
 * @deprecated Legacy HTTP-based DB connection factory.
 *
 * DO NOT use this in application code. The canonical database client is:
 *   import { db } from '@/lib/db'
 *
 * This file exists only for its test suite and potential migration scripts.
 * It uses neon-http (stateless), whereas the app uses neon-serverless
 * (WebSocket, stateful, supports transactions).
 */

// Connection singleton to avoid multiple connections in development
let _db: ReturnType<typeof createDrizzleClient> | null = null;

/**
 * Creates a Drizzle ORM client using Neon serverless HTTP driver
 */
function createDrizzleClient() {
  if (!env.DATABASE_URL) {
    throw new TypeError('DATABASE_URL is not defined');
  }

  // Normalize URL: remove "+neon" marker if present
  const neonUrl = env.DATABASE_URL.replace(
    /^postgres(ql)?\+neon:\/\//,
    'postgres$1://'
  );
  const sql = neon(neonUrl);
  return drizzle(sql);
}

/**
 * Gets a Drizzle ORM client instance
 * In development, reuses the same connection to avoid pool exhaustion
 */
export function getDb() {
  if (process.env.NODE_ENV === 'production') {
    // In production, create a new client for each request to ensure isolation
    return createDrizzleClient();
  }

  // In development, reuse the same client to avoid connection exhaustion
  if (!_db) {
    _db = createDrizzleClient();
  }
  return _db;
}

/**
 * Resets the cached database connection
 * Useful for tests and scripts that need to clean up
 */
export async function closeDb() {
  // Neon HTTP driver has no persistent connection to close
  _db = null;
}
