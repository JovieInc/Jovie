/**
 * AI Gateway model identifiers.
 *
 * Format: `provider/model-name` (forward slash).
 * The Vercel AI Gateway requires this format — using a colon (`:`) instead
 * of a slash will result in a 404 GatewayModelNotFoundError.
 *
 * Tim STRICT 2026-09-17: Gateway allowlist is ONLY
 * `zai/glm-5.3`, `zai/glm-5.3-flash`, `typesafe-ai/jev`.
 * Astra / OpenAI / Anthropic / Grok / Gemini must not use AI Gateway.
 *
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
 * @see https://github.com/JovieInc/Jovie/issues/17938
 */

/** Primary chat model used for the Jovie AI assistant (complex tasks) */
export const CHAT_MODEL = 'zai/glm-5.3';

/** Lightweight chat model for simple tool-calling tasks (profile edits, link adds) */
export const CHAT_MODEL_LIGHT = 'zai/glm-5.3-flash';

/**
 * Fallback chain for the 👎 model-rotation recovery loop (JOV-3362 / #11461).
 *
 * Index 0 is the default chat model. Every entry must stay on the Gateway
 * allowlist (Tim STRICT 2026-09-17).
 */
export const CHAT_MODEL_ROTATION_CHAIN: readonly string[] = [
  CHAT_MODEL,
  CHAT_MODEL_LIGHT,
];

/**
 * Resolve a rotation step (client-supplied integer) to a chain model.
 * Clamps out-of-range values so a hostile or stale client can only ever
 * select a model from the vetted chain.
 */
export function resolveRotatedChatModel(step: number | undefined): string {
  const chain = CHAT_MODEL_ROTATION_CHAIN;
  if (
    typeof step !== 'number' ||
    !Number.isInteger(step) ||
    step <= 0 ||
    chain.length === 0
  ) {
    return CHAT_MODEL;
  }
  return chain[Math.min(step, chain.length - 1)] ?? CHAT_MODEL;
}

/** Model used for AI-generated analytics insights (Gateway allowlisted) */
export const INSIGHT_MODEL = 'zai/glm-5.3-flash';

/** Model used for AI-generated playlist pitches (Gateway allowlisted) */
export const PITCH_MODEL = 'zai/glm-5.3-flash';

/** Lightweight model used for generating conversation titles (Gateway allowlisted) */
export const TITLE_MODEL = 'zai/glm-5.3-flash';

/** Model used for YouTube packaging intelligence extraction (Gateway allowlisted) */
export const PACKAGING_INTELLIGENCE_MODEL = 'zai/glm-5.3-flash';

/**
 * Vision-capable design-taste sweep model.
 * Image/vision on Gateway is not on the STRICT text allowlist yet — kept as
 * GLM flash for any text-only sweep path; image Gateway use fails closed via
 * `assertGatewayAllowlistedModel` until #17938 adds a sanctioned path.
 */
export const DESIGN_TASTE_SWEEP_MODEL = 'zai/glm-5.3-flash';
