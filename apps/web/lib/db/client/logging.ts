/**
 * Database Logging Utilities
 *
 * Enhanced logging for database operations with structured output.
 */

/**
 * Log a database error with context and metadata
 */
export function logDbError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  const errorInfo = {
    context,
    timestamp: new Date().toISOString(),
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack:
              process.env.NODE_ENV === 'development' ? error.stack : undefined,
          }
        : error,
    metadata,
    nodeEnv: process.env.NODE_ENV,
  };

  console.error('[DB_ERROR]', JSON.stringify(errorInfo, null, 2));
}

/**
 * Log database info (development only)
 */
export function logDbInfo(
  context: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === 'development') {
    const info = {
      context,
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };
    console.info('[DB_INFO]', JSON.stringify(info, null, 2));
  }
}
