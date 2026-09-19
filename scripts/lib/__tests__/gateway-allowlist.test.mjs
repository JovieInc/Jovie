import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertGatewayAllowlistedModel,
  GATEWAY_ALLOWLIST,
  GATEWAY_ALLOWLIST_REASON_PREFIX,
  isGatewayAllowlistedModel,
} from '../gateway-allowlist.mjs';

test('allowlist is exactly the three Tim STRICT models', () => {
  assert.deepEqual(
    [...GATEWAY_ALLOWLIST],
    ['zai/glm-5.3', 'zai/glm-5.3-flash', 'typesafe-ai/jev']
  );
});

test('allowlisted models pass', () => {
  for (const id of GATEWAY_ALLOWLIST) {
    assert.equal(isGatewayAllowlistedModel(id), true);
    assert.equal(assertGatewayAllowlistedModel(id), id);
  }
});

for (const modelId of [
  'openai/gpt-5.5-pro',
  'openai/gpt-6-astra',
  'anthropic/claude-opus-4.6',
  'google/gemini-2.5-pro',
  'spacexai/grok-4.20-reasoning',
  'zai/glm-5.3-fast',
]) {
  test(`denies ${modelId}`, () => {
    assert.equal(isGatewayAllowlistedModel(modelId), false);
    assert.throws(
      () => assertGatewayAllowlistedModel(modelId),
      err =>
        err instanceof Error &&
        err.message.includes(GATEWAY_ALLOWLIST_REASON_PREFIX) &&
        err.message.includes(modelId)
    );
  });
}
