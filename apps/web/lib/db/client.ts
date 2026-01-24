import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/lib/env-server';

// Lazy-initialize the database connection to avoid build-time errors
let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof neon> | null = null;

function initializeDatabase() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }

  if (!_sql) {
    _sql = neon(env.DATABASE_URL);
  }

  if (!_db) {
    _db = drizzle(_sql, {
      logger: env.NODE_ENV === 'development',
    });
  }

  return _db;
}

// Create a proxy that initializes the database on first access
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    const realDb = initializeDatabase();
    return realDb[prop as keyof typeof realDb];
  },
});

// Export types
export * from './schema';

export async function getDb() {
  return {
    db,
    // Add any database utility functions here
  };
}
