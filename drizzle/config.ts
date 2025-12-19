import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import ws from 'ws';
import { env } from '../lib/env';

/**
 * Drizzle ORM database connection factory
 *
 * This module provides a unified interface for connecting to PostgreSQL databases
 * using Drizzle ORM, supporting both standard Postgres connections (via postgres-js)
 * and Neon serverless connections.
 *
 * The connection type is determined by the DATABASE_URL format:
 * - postgres:// or postgresql:// -> Standard Postgres connection
 * - postgres+neon:// or postgresql+neon:// -> Neon serverless connection
 */

// Connection singleton to avoid multiple connections in development
let _db: ReturnType<typeof createDrizzleClient> | null = null;
// Keep a reference to the postgres client for proper cleanup
let _postgresClient: ReturnType<typeof postgres> | null = null;
let _neonPool: Pool | null = null;

/**
 * Creates a Drizzle ORM client based on the DATABASE_URL format
 */
function createDrizzleClient() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  // Check if the URL is for Neon
  if (
    env.DATABASE_URL.startsWith('postgres+neon://') ||
    env.DATABASE_URL.startsWith('postgresql+neon://')
  ) {
    // Use Neon serverless driver (WebSocket, transaction-capable)
    // Normalize URL: remove the "+neon" marker for Pool connections
    const neonUrl = env.DATABASE_URL.replace(
      /^postgres(ql)?\+neon:\/\//,
      'postgres$1://'
    );
    neonConfig.webSocketConstructor = ws;
    neonConfig.fetchConnectionCache = true;
    const pool = new Pool({ connectionString: neonUrl });
    _neonPool = pool;
    return drizzleNeon(pool);
  } else {
    // Use standard Postgres driver
    const client = postgres(env.DATABASE_URL, {
      max: 10,
    });
    // Track client so we can close it in tests/scripts
    _postgresClient = client;
    return drizzle(client);
  }
}

/**
 * Gets a Drizzle ORM client instance
 * In development, reuses the same connection to avoid connection pool exhaustion
 */
export function getDb() {
  if (process.env.NODE_ENV === 'production') {
    // In production, create a new client for each request to ensure isolation
    return createDrizzleClient();
  }

  // In development, reuse the same client to avoid connection pool exhaustion
  if (!_db) {
    _db = createDrizzleClient();
  }
  return _db;
}

/**
 * Explicitly closes the database connection
 * Useful for tests and scripts that need to clean up connections
 */
export async function closeDb() {
  if (_db) {
    // If we have a postgres client, close it properly
    if (_postgresClient) {
      await _postgresClient.end();
      _postgresClient = null;
    }
    if (_neonPool) {
      await _neonPool.end();
      _neonPool = null;
    }
    _db = null;
  }
}
