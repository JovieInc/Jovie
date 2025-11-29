'server only';

import { auth } from '@clerk/nextjs/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { type DbType, db } from '@/lib/db';

/**
 * Validates that a userId is a safe Clerk ID format
 * Clerk IDs follow the pattern: user_[a-zA-Z0-9]+
 */
function validateClerkUserId(userId: string): void {
  // Clerk user IDs are alphanumeric with underscores, typically starting with 'user_'
  const clerkIdPattern = /^[a-zA-Z0-9_]+$/;
  if (!clerkIdPattern.test(userId)) {
    throw new Error('Invalid user ID format');
  }
  if (userId.length > 255) {
    throw new Error('User ID too long');
  }
}

/**
 * Sets up the database session for the authenticated user
 * This enables RLS policies to work properly with Clerk user ID
 */
export async function setupDbSession() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  // Validate userId format to prevent SQL injection
  validateClerkUserId(userId);

  // Set the session variable for RLS
  // Using sql.raw with validated input to prevent SQL injection
  await db.execute(drizzleSql.raw(`SET LOCAL app.user_id = '${userId}'`));
  await db.execute(drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${userId}'`));

  return { userId };
}

/**
 * Wrapper function to run database operations with proper session setup
 */
export async function withDbSession<T>(
  operation: (userId: string) => Promise<T>
): Promise<T> {
  const { userId } = await setupDbSession();
  return await operation(userId);
}

/**
 * Run DB operations inside a transaction with RLS session set.
 * Ensures SET LOCAL app.clerk_user_id is applied within the transaction scope.
 */
export async function withDbSessionTx<T>(
  operation: (tx: DbType, userId: string) => Promise<T>
): Promise<T> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  // Validate userId format to prevent SQL injection
  validateClerkUserId(userId);

  return await db.transaction(async tx => {
    // Important: SET LOCAL must be inside the transaction to take effect
    await tx.execute(drizzleSql.raw(`SET LOCAL app.user_id = '${userId}'`));
    await tx.execute(
      drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${userId}'`)
    );
    // Transaction client now properly typed with neon-serverless driver
    return await operation(tx, userId);
  });
}

/**
 * Get the current user ID or throw if not authenticated
 */
export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Authentication required');
  }
  return userId;
}
