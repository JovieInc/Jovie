/**
 * Environment-variable code flags for UI and workflow toggles.
 *
 * Override any flag at runtime via `FEATURE_<FLAG_NAME>`.
 *
 * @example
 * ```shell
 * FEATURE_CANVAS_GRAIN=true pnpm run dev:web
 * ```
 *
 * Keep keys in alphabetical order (code-flags.test.ts enforces it). Concurrent
 * PRs that add flags then insert at different lines and merge cleanly instead
 * of colliding at the end of the object (JOV-7708).
 */

export const CODE_FLAGS = {
  // JOV-6202: signup/signin offer recap. Default off so auth pages and copy
  // stay unchanged. FEATURE_AUTH_OFFER_SUMMARY=true shows the 14-day Pro
  // trial recap. No price, trial-length, Stripe, or entitlement effect.
  AUTH_OFFER_SUMMARY: false,
  CANVAS_GRAIN: true,
  // ChatGPT app-directory MCP at /api/chatgpt/mcp. Default off: the route
  // 404s and is not a live connector. FEATURE_CHATGPT_APP_DIRECTORY_MCP=true
  // enables the anonymous public-artist tools. Does not enable DCR.
  CHATGPT_APP_DIRECTORY_MCP: false,
  CHAT_COMPOSER_V2: true,
  CYAN_FOCUS_GLOW: true,
  // Fundraising YC section order. Default off until Tim approves the
  // narrative in Pen. FEATURE_INVESTOR_PORTAL_YC_DECK=true reorders the
  // existing brief sentences and shows only sourced traction stats.
  INVESTOR_PORTAL_YC_DECK: false,
  // JOV-7323: legacy release and provider-link reads use the in-house
  // cross-DSP ladder before MusicFetch. Default off. Smart-link creation
  // does not call MusicFetch either way. FEATURE_IN_HOUSE_RESOLVER=true
  // turns the product cutover on; false is the kill switch.
  IN_HOUSE_RESOLVER: false,
  // gh-9869: v0 studio-session memory loop (creator tag photo → person/context → studio-session → approval-gated opportunity).
  MEMORY_STUDIO_SESSION_V0: true,
  NEW_RELEASE_PAGE: true,
  // Better Auth dynamic client registration. Default off: Better Auth
  // discovery omits registration_endpoint and /oauth2/register stays closed.
  // FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION=true opens unauthenticated
  // registration limited to the shared MCP redirect allowlist. The founder
  // Ovie issuer advertises /api/ovie/oauth/register on its own.
  OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION: false,
  // JOV-5862: paste-channel thumbnail redo generation (model spend). Ships
  // OFF per cert-sla-v1 — the lander + channel lookup work without it; the
  // flag flips on only when Tim certifies the redo output. Env override:
  // FEATURE_YOUTUBE_THUMBNAILS_PASTE_GENERATE=true
  YOUTUBE_THUMBNAILS_PASTE_GENERATE: false,
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
