// Lightweight environment-gated logger for dev and preview only
// Usage: import { logger } from '@/lib/utils/logger'
//
// NOTE: This module intentionally reads from process.env directly rather than
// importing from env-server.ts, because this logger is used in client components
// and env-server.ts has 'server-only' protection.

/*
  Behavior:
  - Active when NODE_ENV !== 'production' (local dev) OR VERCEL_ENV === 'preview'
  - No-ops in production builds on main
  - next.config.js retains console logs in Preview builds

  Note: We read process.env directly here (not from env-server) to avoid
  importing server-only code into client components that use this logger.
  process.env.NODE_ENV is inlined by Next.js at build time for both server
  and client bundles, so this is safe to use anywhere.
*/

const nodeEnv = process.env.NODE_ENV ?? 'development';
const vercelEnv = process.env.VERCEL_ENV;
const isTest = nodeEnv === 'test';
const isDev = nodeEnv !== 'production' && !isTest;
const isPreview = vercelEnv === 'preview';
const active = isDev || isPreview;

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
  info(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    safeConsole().info(formatMsg(scope, message), payload ?? '');
  },
  debug(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    safeConsole().debug(formatMsg(scope, message), payload ?? '');
  },
  warn(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    safeConsole().warn(formatMsg(scope, message), payload ?? '');
  },
  error(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    safeConsole().error(formatMsg(scope, message), payload ?? '');
  },
};
