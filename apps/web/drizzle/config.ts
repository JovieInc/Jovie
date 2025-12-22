import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env-server';

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
    // Use Neon serverless driver (HTTP)
    // Normalize URL: neon() expects postgresql://... remove the "+neon" marker
    const neonUrl = env.DATABASE_URL.replace(
      /^postgres(ql)?\+neon:\/\//,
      'postgres$1://'
    );
    const sql = neon(neonUrl);
    return drizzleNeon(sql);
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
    // For Neon serverless, there's no persistent connection to close
    _db = null;
  }
}
