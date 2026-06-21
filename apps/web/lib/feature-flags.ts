/**
 * Feature flags -- simple env-var-based toggles for shipping features
 * disabled by default. All new features should check isEnabled()
 * before rendering their UI.
 *
 * How it works:
 * - Each flag name -> boolean pair defines the flag and its default value.
 * - Override any flag at runtime via the env var `FEATURE_<FLAG_NAME>`.
 *
 * @example
 * ```shell
 * FEATURE_CANVAS_GRAIN=true pnpm run dev:web
 * ```
 */

export const FEATURE_FLAGS = {
  NEW_RELEASE_PAGE: true,
  CANVAS_GRAIN: true,
  CYAN_FOCUS_GLOW: true,
  CHAT_COMPOSER_V2: true,
  // gh-9869: v0 studio-session memory loop (creator tag photo → person/context → studio-session → approval-gated opportunity).
  MEMORY_STUDIO_SESSION_V0: true,
} as const satisfies Record<string, boolean>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/** Return whether a feature flag is enabled. */
export function isEnabled(name: FeatureFlag): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return FEATURE_FLAGS[name];
  }
  const envKey = `FEATURE_${name}`;
  const envVal = process.env[envKey];
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return FEATURE_FLAGS[name];
}
