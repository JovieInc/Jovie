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

/** Model used for AI-generated analytics insights */
export const INSIGHT_MODEL = 'anthropic/claude-haiku-4-5-20251001';

/** Lightweight model used for generating conversation titles */
export const TITLE_MODEL = 'google/gemini-2.0-flash';
