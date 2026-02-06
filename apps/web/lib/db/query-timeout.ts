/**
 * Query Timeout Utilities
 *
 * Provides configurable timeouts for database queries to prevent
 * slow queries from blocking database connections.
 *
 * Default timeouts:
 * - Dashboard queries: 10 seconds
 * - API queries: 5 seconds
 */

import { sql as drizzleSql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';

// Timeout configuration in milliseconds
export const QUERY_TIMEOUTS = {
  dashboard: 10000, // 10 seconds for dashboard queries
  api: 5000, // 5 seconds for API queries
  default: 5000, // 5 seconds default
} as const;

export type TimeoutType = keyof typeof QUERY_TIMEOUTS;

/**
 * Wraps a promise with a timeout
 * @param promise - The promise to wrap
 * @param ms - Timeout in milliseconds
 * @param context - Description of the operation for error messages
 * @returns The result of the promise or throws on timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  context: string = 'Query'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new QueryTimeoutError(`${context} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Custom error for query timeouts
 */
export class QueryTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Sets the PostgreSQL statement timeout for the current session.
 * Uses SET (session-scoped) instead of SET LOCAL, because SET LOCAL is a
 * no-op outside a transaction block and the Neon HTTP driver does not
 * support transactions.
 */
export async function setStatementTimeout(
  db: NeonDatabase,
  timeoutMs: number
): Promise<void> {
  await db.execute(drizzleSql`SET statement_timeout = ${timeoutMs}`);
}

/**
 * Helper to execute a query with a specific timeout type
 * @param queryFn - Function that executes the query
 * @param type - Type of timeout to apply
 * @param context - Description for error messages
 */
export async function executeWithTimeout<T>(
  queryFn: () => Promise<T>,
  type: TimeoutType = 'default',
  context: string = 'Query'
): Promise<T> {
  const timeout = QUERY_TIMEOUTS[type];
  return withTimeout(queryFn(), timeout, context);
}

/**
 * Dashboard query wrapper with 10s timeout
 */
export async function dashboardQuery<T>(
  queryFn: () => Promise<T>,
  context: string = 'Dashboard query'
): Promise<T> {
  return executeWithTimeout(queryFn, 'dashboard', context);
}

/**
 * API query wrapper with 5s timeout
 */
export async function apiQuery<T>(
  queryFn: () => Promise<T>,
  context: string = 'API query'
): Promise<T> {
  return executeWithTimeout(queryFn, 'api', context);
}

/**
 * Checks if an error is a query timeout error
 */
export function isQueryTimeoutError(
  error: unknown
): error is QueryTimeoutError {
  return error instanceof QueryTimeoutError;
}

/**
 * Checks if an error is a PostgreSQL statement timeout error
 */
export function isPostgresTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    // PostgreSQL timeout error code
    return error.message.includes(
      'canceling statement due to statement timeout'
    );
  }
  return false;
}
