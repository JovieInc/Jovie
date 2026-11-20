import routingRegistry from './routing.json';

/**
 * Typed view of `routing.json`, the single source of truth for which provider
 * serves which model call. Runtime routing in `sdk.ts` and the drift check in
 * `scripts/ai-routing-check.mjs` both read the same file.
 */
export type AiRoute =
  | 'workers-first'
  | 'gateway-first'
  | 'gateway-only'
  | 'workers-ai-only';

export interface AiRoutingCaller {
  readonly id: string;
  readonly route: AiRoute;
  readonly models: readonly string[];
}

export const AI_ROUTING = routingRegistry;

/**
 * Chat is user facing and latency sensitive: Gateway first, Workers AI only on
 * a credit/quota failure. Every other call (classifiers, extractors, insights,
 * titles, crons) is background work and goes to Workers AI first.
 */
export function isChatCall(input: {
  readonly functionId?: string;
  readonly tags?: readonly unknown[];
}): boolean {
  return (
    /chat/iu.test(input.functionId ?? '') ||
    (input.tags ?? []).some(tag => /chat/iu.test(String(tag)))
  );
}

export function routeForCall(input: {
  readonly functionId?: string;
  readonly tags?: readonly unknown[];
}): Extract<AiRoute, 'workers-first' | 'gateway-first'> {
  return isChatCall(input) ? 'gateway-first' : 'workers-first';
}
