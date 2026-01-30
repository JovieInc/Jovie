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

  Why we use process.env directly here:
  - lib/env.ts has 'server-only' protection, so importing it breaks client components
  - lib/env-public.ts only exposes NEXT_PUBLIC_* variables, not NODE_ENV/VERCEL_ENV
  - NODE_ENV and VERCEL_ENV are Next.js build-time constants that get inlined during
    compilation for both server and client bundles (not runtime secrets), making
    direct process.env access the correct and safe pattern for this specific case
*/

const nodeEnv = process.env.NODE_ENV ?? 'development';
const vercelEnv = process.env.VERCEL_ENV;
const isTest = nodeEnv === 'test';
const isDev = nodeEnv !== 'production' && !isTest;
const isPreview = vercelEnv === 'preview';
const active = isDev || isPreview;

function safeConsole() {
  // Ensure console exists in all environments
  return typeof console === 'undefined' ? ({} as Console) : console;
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
    const c = safeConsole();
    c.info?.(formatMsg(scope, message), payload ?? '');
  },
  debug(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    const c = safeConsole();
    c.debug?.(formatMsg(scope, message), payload ?? '');
  },
  warn(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    const c = safeConsole();
    c.warn?.(formatMsg(scope, message), payload ?? '');
  },
  error(message: unknown, payload?: unknown, scope?: string) {
    if (!active) return;
    const c = safeConsole();
    c.error?.(formatMsg(scope, message), payload ?? '');
  },
};
