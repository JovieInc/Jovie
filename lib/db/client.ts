import { db } from './index';

// Export types
export * from './schema';

export async function getDb() {
  return {
    db,
    // Add any database utility functions here
  };
}
