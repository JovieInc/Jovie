/**
 * AI Gateway model identifiers.
 *
 * Format: `provider/model-name` (forward slash).
 * The Vercel AI Gateway requires this format — using a colon (`:`) instead
 * of a slash will result in a 404 GatewayModelNotFoundError.
 *
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
 */

/**
 * Founder gateway policy (Tim STRICT 2026-09-17, extended 2026-09-28): the Jovie
 * AI Gateway allowlist is zai/glm-5.3 and zai/glm-5.3-flash. Anything else is
 * rejected `forbidden`, which surfaced as empty chat turns (JOV-6533). Keep
 * every runtime model on the allowlist.
 */
export const GATEWAY_ALLOWED_MODELS: readonly string[] = [
  'zai/glm-5.3',
  'zai/glm-5.3-flash',
];

/**
 * Providers banned on the Vercel AI Gateway (Tim directive 2026-09-28,
 * JOV-7119): per-token API billing for OpenAI or Anthropic is not allowed under
 * any path. GPT-6-class usage is permitted only on founder-owned subscriptions
 * (e.g. the Codex lane), never through the gateway. Callers must fail fast —
 * never silently fall back to another model on these providers.
 */
export const GATEWAY_BANNED_PROVIDERS: readonly string[] = [
  'openai',
  'anthropic',
];

export function isGatewayBannedModel(modelId: string): boolean {
  const provider = modelId.split('/', 1)[0];
  return GATEWAY_BANNED_PROVIDERS.includes(provider);
}

/** Throws when a gateway model id uses a banned provider (JOV-7119). */
export function assertGatewayModelAllowed(modelId: string): void {
  if (isGatewayBannedModel(modelId)) {
    throw new Error(
      `AI Gateway model "${modelId}" uses a banned provider (${GATEWAY_BANNED_PROVIDERS.join('/')}) — OpenAI and Anthropic are not billed through the gateway (JOV-7119).`
    );
  }
}

/** Stable operator-facing name for the founder-owned Gateway model policy. */
export const GATEWAY_ALLOWLIST_NAME = 'founder-strict-2026-09-17';

/** Primary chat model used for the Jovie AI assistant (complex tasks) */
export const CHAT_MODEL = 'zai/glm-5.3';

/** Lightweight chat model for simple tool-calling tasks (profile edits, link adds) */
export const CHAT_MODEL_LIGHT = 'zai/glm-5.3-flash';

/**
 * Fallback chain for the 👎 model-rotation recovery loop (JOV-3362 / #11461).
 *
 * Index 0 is the default chat model. When a user thumbs-down a response, the
 * conversation's next turn is routed to the next entry. Only gateway-allowlisted
 * models (GATEWAY_ALLOWED_MODELS) may appear here.
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

/** Model used for AI-generated analytics insights */
export const INSIGHT_MODEL = 'zai/glm-5.3-flash';

/** Model used for AI-generated playlist pitches */
export const PITCH_MODEL = 'zai/glm-5.3-flash';

/** Lightweight model used for generating conversation titles */
export const TITLE_MODEL = 'zai/glm-5.3-flash';

/** Model used for YouTube packaging intelligence extraction */
export const PACKAGING_INTELLIGENCE_MODEL = 'zai/glm-5.3-flash';

/** Model used for the golden-journey design-taste sweep */
export const DESIGN_TASTE_SWEEP_MODEL = 'zai/glm-5.3';

/**
 * Album-art background model for AI SDK `generateImage` via the Gateway.
 *
 * Same Grok Imagine model the feature already used. Gateway catalog price on
 * 2026-09-25: $0.02 per image. A generation requests three images.
 * Swap this constant to change the model. Keep it on a cheap image tier —
 * OpenAI image models and other expensive Gateway tiers are out of policy.
 */
export const ALBUM_ART_GATEWAY_IMAGE_MODEL = 'spacexai/grok-imagine-image';
