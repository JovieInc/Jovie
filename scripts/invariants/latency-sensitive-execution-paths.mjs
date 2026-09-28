/**
 * JOV-INV-031 scan scope, kept dependency-free so CI path selection can import
 * the exact roots the thread-blocking gate walks without loading TypeScript.
 */

export const ALLOWLIST_PATH =
  'scripts/invariants/latency-sensitive-execution-allowlist.json';
export const ESLINT_CONFIG_PATH = 'apps/web/eslint.config.js';

export const RUNTIME_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/lib',
  'apps/web/components',
  'apps/web/hooks',
  'apps/web/middleware.ts',
  'apps/web/proxy.ts',
  'apps/desktop/src',
  'packages/ui',
  'packages/auth-routing',
  'packages/audio-contracts',
  'packages/extension-contracts',
  'packages/agent-transport-contracts',
]);

export const DESKTOP_ENTRY_POINTS = Object.freeze([
  'apps/desktop/src/main.ts',
  'apps/desktop/src/preload.ts',
]);
