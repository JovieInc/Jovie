/**
 * Fail-closed Vercel AI Gateway allowlist (Tim STRICT 2026-09-17).
 *
 * Only these model IDs may be requested through AI Gateway.
 * Astra / OpenAI / Anthropic / Grok / Gemini / etc. use subscriptions
 * (Codex / Max / provider keys) — never AI_GATEWAY_API_KEY.
 *
 * Platform Gateway deny rules are a separate spend brake; this helper
 * stops callers before the network so CI pins and product code cannot
 * slip past the allowlist.
 *
 * Follow-on hardening: https://github.com/JovieInc/Jovie/issues/17938
 */

export const GATEWAY_ALLOWLIST = Object.freeze([
  'zai/glm-5.3',
  'zai/glm-5.3-flash',
  'typesafe-ai/jev',
] as const);

export type GatewayAllowlistedModel = (typeof GATEWAY_ALLOWLIST)[number];

export const GATEWAY_ALLOWLIST_REASON_PREFIX = 'gateway-allowlist:denied-model';

const ALLOWED = new Set<string>(GATEWAY_ALLOWLIST);

export function isGatewayAllowlistedModel(
  modelId: string
): modelId is GatewayAllowlistedModel {
  return ALLOWED.has(modelId);
}

export function assertGatewayAllowlistedModel(
  modelId: string
): GatewayAllowlistedModel {
  if (!isGatewayAllowlistedModel(modelId)) {
    throw new Error(
      `${GATEWAY_ALLOWLIST_REASON_PREFIX} ${modelId}; only ${GATEWAY_ALLOWLIST.join(', ')} may use Vercel AI Gateway (Tim STRICT 2026-09-17). Expensive models use subscriptions, never Gateway.`
    );
  }
  return modelId;
}
