import { env } from '@/lib/env-server';

export type DevCleanupFn = () => void | Promise<void>;

interface ProcessWithOnce {
  once(event: 'beforeExit' | 'SIGINT' | 'SIGTERM', listener: () => void): void;
}

declare global {
  // eslint-disable-next-line no-var
  var jovieDevCleanupRegistered: boolean | undefined;
  // eslint-disable-next-line no-var
  var jovieDevCleanupFns: Map<string, DevCleanupFn> | undefined;
  // eslint-disable-next-line no-var
  var jovieDevMemoryMonitorInterval: ReturnType<typeof setInterval> | undefined;
}

function isDevNodeRuntime(): boolean {
  if (typeof process === 'undefined') {
    return false;
  }

  return (
    env.NODE_ENV !== 'production' &&
    typeof (process as unknown as ProcessWithOnce).once === 'function'
  );
}

function ensureRegistry(): Map<string, DevCleanupFn> {
  if (!globalThis.jovieDevCleanupFns) {
    globalThis.jovieDevCleanupFns = new Map<string, DevCleanupFn>();
  }
  return globalThis.jovieDevCleanupFns;
}

export function registerDevCleanup(key: string, fn: DevCleanupFn): void {
  if (!isDevNodeRuntime()) {
    return;
  }

  const registry = ensureRegistry();
  registry.set(key, fn);

  if (!globalThis.jovieDevCleanupRegistered) {
    globalThis.jovieDevCleanupRegistered = true;
    const proc = process as unknown as ProcessWithOnce;

    const run = (reason: 'beforeExit' | 'SIGINT' | 'SIGTERM') => {
      void runDevCleanups(reason);
    };

    proc.once('beforeExit', () => run('beforeExit'));
    proc.once('SIGINT', () => {
      void (async () => {
        try {
          await runDevCleanups('SIGINT');
          // Only exit in Node.js runtime, not Edge Runtime
          if (typeof process.exit === 'function') {
            process.exit(0);
          }
        } catch (error) {
          console.error('[DEV_CLEANUP_FATAL]', {
            reason: 'SIGINT',
            error: error instanceof Error ? error.message : String(error),
          });
          // Only exit in Node.js runtime, not Edge Runtime
          if (typeof process.exit === 'function') {
            process.exit(1);
          }
        }
      })();
    });
    proc.once('SIGTERM', () => {
      void (async () => {
        try {
          await runDevCleanups('SIGTERM');
          // Only exit in Node.js runtime, not Edge Runtime
          if (typeof process.exit === 'function') {
            process.exit(0);
          }
        } catch (error) {
          console.error('[DEV_CLEANUP_FATAL]', {
            reason: 'SIGTERM',
            error: error instanceof Error ? error.message : String(error),
          });
          // Only exit in Node.js runtime, not Edge Runtime
          if (typeof process.exit === 'function') {
            process.exit(1);
          }
        }
      })();
    });
  }
}

export async function runDevCleanups(
  reason: 'beforeExit' | 'SIGINT' | 'SIGTERM'
): Promise<void> {
  if (!isDevNodeRuntime()) {
    return;
  }

  if (globalThis.jovieDevMemoryMonitorInterval) {
    clearInterval(globalThis.jovieDevMemoryMonitorInterval);
    globalThis.jovieDevMemoryMonitorInterval = undefined;
  }

  const registry = globalThis.jovieDevCleanupFns;
  if (!registry) {
    return;
  }

  const fns = Array.from(registry.entries());
  registry.clear();

  for (const [key, fn] of fns) {
    try {
      await fn();
    } catch (error) {
      console.error('[DEV_CLEANUP_ERROR]', {
        reason,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startDevMemoryMonitor(options?: {
  intervalMs?: number;
  enabled?: boolean;
}): void {
  if (!isDevNodeRuntime()) {
    return;
  }

  const enabled =
    options?.enabled ??
    (typeof process !== 'undefined' && env.JOVIE_DEV_MEMORY_MONITOR === '1');
  if (!enabled) {
    return;
  }

  if (globalThis.jovieDevMemoryMonitorInterval) {
    return;
  }

  const intervalMs = options?.intervalMs ?? 60_000;
  // Use bracket notation to avoid Edge Runtime static analyzer detecting Node.js API
  const memUsage =
    typeof process === 'undefined'
      ? undefined
      : (process as { memoryUsage?: () => NodeJS.MemoryUsage })['memoryUsage'];

  if (typeof memUsage !== 'function') {
    return;
  }

  globalThis.jovieDevMemoryMonitorInterval = setInterval(() => {
    const mem = memUsage();
    console.info('[DEV_MEMORY]', {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    });
  }, intervalMs);

  registerDevCleanup('dev_memory_monitor', () => {
    if (globalThis.jovieDevMemoryMonitorInterval) {
      clearInterval(globalThis.jovieDevMemoryMonitorInterval);
      globalThis.jovieDevMemoryMonitorInterval = undefined;
    }
  });
}
