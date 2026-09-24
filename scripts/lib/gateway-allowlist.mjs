/**
 * Fail-closed Vercel AI Gateway allowlist for CI scripts.
 * Keep in sync with apps/web/lib/ai/gateway-allowlist.ts
 * Tim STRICT 2026-09-17. Follow-on: #17938
 */

export const GATEWAY_ALLOWLIST = Object.freeze([
  'zai/glm-5.3',
  'zai/glm-5.3-flash',
  'typesafe-ai/jev',
]);

export const GATEWAY_ALLOWLIST_REASON_PREFIX = 'gateway-allowlist:denied-model';

const ALLOWED = new Set(GATEWAY_ALLOWLIST);

export function isGatewayAllowlistedModel(modelId) {
  return ALLOWED.has(String(modelId ?? ''));
}

export function assertGatewayAllowlistedModel(modelId) {
  const id = String(modelId ?? '');
  if (!isGatewayAllowlistedModel(id)) {
    throw new Error(
      `${GATEWAY_ALLOWLIST_REASON_PREFIX} ${id}; only ${GATEWAY_ALLOWLIST.join(', ')} may use Vercel AI Gateway (Tim STRICT 2026-09-17). Expensive models use subscriptions, never Gateway.`
    );
  }
  return id;
}
