// Lightweight environment-gated logger for dev and preview only
// Usage: import { logger } from '@/lib/utils/logger'

/*
  Behavior:
  - info() and debug() active when NODE_ENV !== 'production' (local dev) OR VERCEL_ENV === 'preview'
  - error() and warn() ALWAYS log (critical errors should never be silenced)
  - next.config.js retains console logs in Preview builds
  - Use alwaysLog option to force logging in production for critical paths
*/

const nodeEnv = process.env.NODE_ENV;
const vercelEnv = process.env.VERCEL_ENV;
const isTest = nodeEnv === 'test';
const isDev = nodeEnv !== 'production' && !isTest;
const isPreview = vercelEnv === 'preview';

/** Active for info/debug level logs (dev/preview only) */
const active = isDev || isPreview;

/** Options for log methods */
export interface LogOptions {
  /** Force logging even in production (for critical paths) */
  alwaysLog?: boolean;
}

function safeConsole() {
  // Ensure console exists in all environments
  return typeof console !== 'undefined' ? console : ({} as Console);
}

function formatMsg(scope: string | undefined, msg: unknown) {
  return scope ? `[${scope}] ${String(msg)}` : String(msg);
}

export const logger = {
  enabled: active,
  group(label?: string) {
    if (!active) return;
    const c = safeConsole();
    if (c.group) c.group(label ?? '');
  },
  groupCollapsed(label?: string) {
    if (!active) return;
    const c = safeConsole();
    if (c.groupCollapsed) c.groupCollapsed(label ?? '');
  },
  groupEnd() {
    if (!active) return;
    const c = safeConsole();
    if (c.groupEnd) c.groupEnd();
  },
  /**
   * Log info message (dev/preview only, unless alwaysLog is true)
   */
  info(
    message: unknown,
    payload?: unknown,
    scope?: string,
    options?: LogOptions
  ) {
    if (!active && !options?.alwaysLog) return;
    safeConsole().info(formatMsg(scope, message), payload ?? '');
  },
  /**
   * Log debug message (dev/preview only, unless alwaysLog is true)
   */
  debug(
    message: unknown,
    payload?: unknown,
    scope?: string,
    options?: LogOptions
  ) {
    if (!active && !options?.alwaysLog) return;
    safeConsole().debug(formatMsg(scope, message), payload ?? '');
  },
  /**
   * Log warning message (ALWAYS logs in all environments - critical warnings should never be silenced)
   */
  warn(message: unknown, payload?: unknown, scope?: string) {
    // Always log warnings - they indicate potential issues that need attention
    safeConsole().warn(formatMsg(scope, message), payload ?? '');
  },
  /**
   * Log error message (ALWAYS logs in all environments - errors should never be silenced)
   */
  error(message: unknown, payload?: unknown, scope?: string) {
    // Always log errors - they are critical and should never be silenced
    safeConsole().error(formatMsg(scope, message), payload ?? '');
  },
};

/** Scoped logger interface - all methods have the scope pre-baked */
export interface ScopedLogger {
  /** Whether info/debug logging is enabled (dev/preview only) */
  readonly enabled: boolean;
  /** The scope prefix for this logger */
  readonly scope: string;
  /** Log info message (dev/preview only, unless alwaysLog is true) */
  info(message: unknown, payload?: unknown, options?: LogOptions): void;
  /** Log debug message (dev/preview only, unless alwaysLog is true) */
  debug(message: unknown, payload?: unknown, options?: LogOptions): void;
  /** Log warning message (ALWAYS logs in all environments) */
  warn(message: unknown, payload?: unknown): void;
  /** Log error message (ALWAYS logs in all environments) */
  error(message: unknown, payload?: unknown): void;
  /** Start a console group (dev/preview only) */
  group(label?: string): void;
  /** Start a collapsed console group (dev/preview only) */
  groupCollapsed(label?: string): void;
  /** End current console group (dev/preview only) */
  groupEnd(): void;
}

/**
 * Creates a scoped logger instance with a fixed scope prefix.
 * All log methods will automatically prefix messages with [scope].
 *
 * @param scope - The scope prefix (e.g., 'DB', 'Analytics', 'Auth')
 * @returns A ScopedLogger instance with pre-baked scope
 *
 * @example
 * ```ts
 * const log = createScopedLogger('DB');
 * log.info('Connected'); // logs: [DB] Connected
 * log.error('Connection failed', { host: 'localhost' }); // logs: [DB] Connection failed { host: 'localhost' }
 * ```
 */
export function createScopedLogger(scope: string): ScopedLogger {
  return {
    enabled: active,
    scope,
    info(message: unknown, payload?: unknown, options?: LogOptions) {
      logger.info(message, payload, scope, options);
    },
    debug(message: unknown, payload?: unknown, options?: LogOptions) {
      logger.debug(message, payload, scope, options);
    },
    warn(message: unknown, payload?: unknown) {
      logger.warn(message, payload, scope);
    },
    error(message: unknown, payload?: unknown) {
      logger.error(message, payload, scope);
    },
    group(label?: string) {
      logger.group(label ? `[${scope}] ${label}` : `[${scope}]`);
    },
    groupCollapsed(label?: string) {
      logger.groupCollapsed(label ? `[${scope}] ${label}` : `[${scope}]`);
    },
    groupEnd() {
      logger.groupEnd();
    },
  };
}
