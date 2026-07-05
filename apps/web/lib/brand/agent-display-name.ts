/**
 * User-visible agent brand label for review comments, HUD summaries, and
 * other contributor-facing surfaces. Internal codenames (Hermes, etc.) must
 * not leak into these strings — see JOV-3121.
 */
export const JOVIE_AGENT_DISPLAY_NAME = 'Jovie agent' as const;

/** Forbidden user-visible brand leak patterns (case-insensitive). */
export const FORBIDDEN_USER_VISIBLE_AGENT_BRANDS = [
  'Hermes agent',
  'hermes agent',
] as const;
