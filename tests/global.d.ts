import { NeonQueryFunction } from '@neondatabase/serverless';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';

declare global {
  // Extend the global namespace to include our test database
  // This makes TypeScript aware of the global `db` variable we're using in tests
  // eslint-disable-next-line no-var
  var db: NeonDatabase<Record<string, never>>;

  // If you're using the raw SQL client directly, you might also want:
  // var sql: NeonQueryFunction<boolean, boolean>;
}

export {}; // This file needs to be a module
