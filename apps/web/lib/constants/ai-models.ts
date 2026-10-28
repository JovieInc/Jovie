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
 * Founder gateway policy (Tim STRICT 2026-09-17, locked 2026-09-17 per
 * JOV-8109): the Jovie AI Gateway allowlist is exactly zai/glm-5.3,
 * zai/glm-5.3-flash, and typesafe-ai/jev. Anything else is rejected
 * `forbidden`, which surfaced as empty chat turns (JOV-6533). Keep every
 * runtime text model on the allowlist — `gateway()` enforces this list
 * fail-closed. Expensive work goes through subscriptions, never the Gateway.
 */
export const GATEWAY_ALLOWED_MODELS: readonly string[] = [
  'typesafe-ai/jev',
  'zai/glm-5.3',
  'zai/glm-5.3-flash',
];

/**
 * Gateway image-model allowlist (JOV-8109): `gateway.image()` is also
 * fail-closed. Only models in live use (album art + the enabled merch A/B
 * entry) may pass; anything else throws before it can bill the gateway.
 */
export const GATEWAY_ALLOWED_IMAGE_MODELS: readonly string[] = [
  'recraft/recraft-v3',
  'spacexai/grok-imagine-image',
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

/**
 * Throws when a gateway text model id is not on the fail-closed allowlist
 * (JOV-8109). Banned providers (JOV-7119) get their own clearer error.
 */
export function assertGatewayModelAllowed(modelId: string): void {
  if (isGatewayBannedModel(modelId)) {
    throw new Error(
      `AI Gateway model "${modelId}" uses a banned provider (${GATEWAY_BANNED_PROVIDERS.join('/')}) — OpenAI and Anthropic are not billed through the gateway (JOV-7119).`
    );
  }
  if (!GATEWAY_ALLOWED_MODELS.includes(modelId)) {
    throw new Error(
      `AI Gateway model "${modelId}" is not on the allowlist (${GATEWAY_ALLOWED_MODELS.join(', ')}) — the gateway is fail-closed and everything else is denied (${GATEWAY_ALLOWLIST_NAME}, JOV-8109).`
    );
  }
}

/**
 * Throws when a gateway image model id is not on the image allowlist
 * (JOV-8109). Same fail-closed policy as {@link assertGatewayModelAllowed}.
 */
export function assertGatewayImageModelAllowed(modelId: string): void {
  if (isGatewayBannedModel(modelId)) {
    throw new Error(
      `AI Gateway image model "${modelId}" uses a banned provider (${GATEWAY_BANNED_PROVIDERS.join('/')}) — OpenAI and Anthropic are not billed through the gateway (JOV-7119).`
    );
  }
  if (!GATEWAY_ALLOWED_IMAGE_MODELS.includes(modelId)) {
    throw new Error(
      `AI Gateway image model "${modelId}" is not on the image allowlist (${GATEWAY_ALLOWED_IMAGE_MODELS.join(', ')}) — the gateway is fail-closed (JOV-8109).`
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
