'server only';

import { auth } from '@clerk/nextjs/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { type DbType, db } from '@/lib/db';

/**
 * Validates that a userId is a safe Clerk ID format
 * Clerk IDs follow the pattern: user_[a-zA-Z0-9]+
 */
export function validateClerkUserId(userId: string): void {
  // Clerk user IDs are alphanumeric with underscores, typically starting with 'user_'
  const clerkIdPattern = /^[a-zA-Z0-9_-]+$/;
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
async function resolveClerkUserId(clerkUserId?: string): Promise<string> {
  if (clerkUserId) {
    validateClerkUserId(clerkUserId);
    return clerkUserId;
  }

  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  // Validate userId format to prevent SQL injection
  validateClerkUserId(userId);
  return userId;
}

/**
 * Sets up the database session for the authenticated user
 * This enables RLS policies to work properly with Clerk user ID
 */
export async function setupDbSession(clerkUserId?: string) {
  const userId = await resolveClerkUserId(clerkUserId);

  // Set the session variable for RLS
  // Using sql.raw with validated input to prevent SQL injection
  await db.execute(
    drizzleSql`SELECT set_config('app.user_id', ${userId}, true)`
  );
  await db.execute(
    drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, true)`
  );

  return { userId };
}

/**
 * Wrapper function to run database operations with proper session setup
 */
export async function withDbSession<T>(
  operation: (userId: string) => Promise<T>,
  options?: { clerkUserId?: string }
): Promise<T> {
  const { userId } = await setupDbSession(options?.clerkUserId);
  return await operation(userId);
}

/**
 * Transaction isolation levels supported by PostgreSQL
 */
export type IsolationLevel =
  | 'read_committed'
  | 'repeatable_read'
  | 'serializable';

/**
 * Run DB operations inside a transaction with RLS session set.
 * Ensures SET LOCAL app.clerk_user_id is applied within the transaction scope.
 *
 * @param operation - The database operation to execute within the transaction
 * @param options.clerkUserId - Optional explicit Clerk user ID (uses auth() if not provided)
 * @param options.isolationLevel - Transaction isolation level (default: read_committed)
 *   - 'read_committed': Default, allows phantom reads between SELECT and INSERT
 *   - 'repeatable_read': Prevents non-repeatable reads
 *   - 'serializable': Strictest, prevents all concurrency anomalies (use for critical operations like profile creation)
 */
export async function withDbSessionTx<T>(
  operation: (tx: DbType, userId: string) => Promise<T>,
  options?: { clerkUserId?: string; isolationLevel?: IsolationLevel }
): Promise<T> {
  const userId = await resolveClerkUserId(options?.clerkUserId);
  const isolationLevel = options?.isolationLevel ?? 'read_committed';

  // In tests, db may be a lightweight mock without transaction support.
  if (typeof (db as DbType).transaction !== 'function') {
    // Fall back to using the mocked db object directly.
    return await operation(db as unknown as DbType, userId);
  }

  return await db.transaction(async tx => {
    // Set transaction isolation level if not default
    // CRITICAL: For onboarding, use SERIALIZABLE to prevent race conditions
    // where two users claim the same handle simultaneously
    if (isolationLevel !== 'read_committed') {
      const isolationSql =
        isolationLevel === 'serializable'
          ? drizzleSql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
          : drizzleSql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
      await tx.execute(isolationSql);
    }

    // Important: SET LOCAL must be inside the transaction to take effect.
    // In unit tests, drizzleSql may be mocked without .raw; guard accordingly.
    await tx.execute(
      drizzleSql`SELECT set_config('app.user_id', ${userId}, true)`
    );
    await tx.execute(
      drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, true)`
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
