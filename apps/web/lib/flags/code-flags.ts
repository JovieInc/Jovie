/**
 * Environment-variable code flags for UI and workflow toggles.
 *
 * Override any flag at runtime via `FEATURE_<FLAG_NAME>`.
 *
 * @example
 * ```shell
 * FEATURE_CANVAS_GRAIN=true pnpm run dev:web
 * ```
 */

export const CODE_FLAGS = {
  NEW_RELEASE_PAGE: true,
  CANVAS_GRAIN: true,
  CYAN_FOCUS_GLOW: true,
  CHAT_COMPOSER_V2: true,
  // gh-9869: v0 studio-session memory loop (creator tag photo → person/context → studio-session → approval-gated opportunity).
  MEMORY_STUDIO_SESSION_V0: true,
} as const satisfies Record<string, boolean>;

export type CodeFlagName = keyof typeof CODE_FLAGS;

/** Return whether an env-driven code flag is enabled. */
export function isCodeFlagEnabled(name: CodeFlagName): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return CODE_FLAGS[name];
  }
  const envKey = `FEATURE_${name}`;
  const envVal = process.env[envKey];
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return CODE_FLAGS[name];
}
