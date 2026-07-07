/**
 * AI Gateway model identifiers.
 *
 * Format: `provider/model-name` (forward slash).
 * The Vercel AI Gateway requires this format — using a colon (`:`) instead
 * of a slash will result in a 404 GatewayModelNotFoundError.
 *
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
 */

/** Primary chat model used for the Jovie AI assistant (complex tasks) */
export const CHAT_MODEL = 'anthropic/claude-sonnet-4-20250514';

/** Lightweight chat model for simple tool-calling tasks (profile edits, link adds) */
export const CHAT_MODEL_LIGHT = 'anthropic/claude-haiku-4-5-20251001';

/**
 * Fallback chain for the 👎 model-rotation recovery loop (JOV-3362 / #11461).
 *
 * Index 0 is the default chat model. When a user thumbs-down a response, the
 * conversation's next turn is routed to the next entry. Google models are
 * proven working through the gateway (TITLE_MODEL); do not append providers
 * that are not enabled on the gateway account.
 */
export const CHAT_MODEL_ROTATION_CHAIN: readonly string[] = [
  CHAT_MODEL,
  'google/gemini-2.5-pro',
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

/** Model used for AI-generated analytics insights */
export const INSIGHT_MODEL = 'anthropic/claude-haiku-4-5-20251001';

/** Model used for AI-generated playlist pitches */
export const PITCH_MODEL = 'anthropic/claude-haiku-4-5-20251001';

/** Lightweight model used for generating conversation titles */
export const TITLE_MODEL = 'google/gemini-2.0-flash';

/** Model used for YouTube packaging intelligence extraction */
export const PACKAGING_INTELLIGENCE_MODEL =
  'anthropic/claude-haiku-4-5-20251001';

/** Vision-capable model used for the golden-journey design-taste sweep */
export const DESIGN_TASTE_SWEEP_MODEL = 'anthropic/claude-haiku-4-5-20251001';
