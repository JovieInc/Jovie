import { describe, expect, it } from 'vitest';
import {
  GATEWAY_ALLOWLIST,
  GATEWAY_ALLOWLIST_REASON_PREFIX,
  assertGatewayAllowlistedModel,
  isGatewayAllowlistedModel,
} from '@/lib/ai/gateway-allowlist';

describe('gateway allowlist (Tim STRICT 2026-09-17)', () => {
  it('allows only the three sanctioned model ids', () => {
    expect([...GATEWAY_ALLOWLIST]).toEqual([
      'zai/glm-5.3',
      'zai/glm-5.3-flash',
      'typesafe-ai/jev',
    ]);
    for (const id of GATEWAY_ALLOWLIST) {
      expect(isGatewayAllowlistedModel(id)).toBe(true);
      expect(assertGatewayAllowlistedModel(id)).toBe(id);
    }
  });

  it.each([
    'openai/gpt-5.5-pro',
    'openai/gpt-6-astra',
    'openai/gpt-5.6-sol',
    'anthropic/claude-sonnet-4.5',
    'google/gemini-2.5-pro',
    'spacexai/grok-4.20-reasoning',
    'xai/grok-4.6',
    'moonshotai/kimi-k3',
    'zai/glm-5.3-fast',
  ])('denies %s with gateway-allowlist reason', modelId => {
    expect(isGatewayAllowlistedModel(modelId)).toBe(false);
    expect(() => assertGatewayAllowlistedModel(modelId)).toThrow(
      GATEWAY_ALLOWLIST_REASON_PREFIX
    );
    expect(() => assertGatewayAllowlistedModel(modelId)).toThrow(modelId);
  });
});
