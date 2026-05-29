/**
 * Minimal logger for cache operations.
 * Prefixes all messages with [cache] for easy filtering.
 */
export const cacheLogger = {
  warn: (message: string, ...args: unknown[]) => {
    console.warn('[cache] ' + message, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error('[cache] ' + message, ...args);
  },
};
