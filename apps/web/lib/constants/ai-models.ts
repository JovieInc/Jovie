/**
 * AI Gateway model identifiers.
 *
 * Format: `provider/model-name` (forward slash).
 * The Vercel AI Gateway requires this format — using a colon (`:`) instead
 * of a slash will result in a 404 GatewayModelNotFoundError.
 *
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
 */

/** Primary chat model used for the Jovie AI assistant */
export const CHAT_MODEL = 'anthropic/claude-sonnet-4-20250514';

/** Lightweight model used for generating conversation titles */
export const TITLE_MODEL = 'google/gemini-2.0-flash';
