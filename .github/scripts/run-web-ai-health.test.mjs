import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPECTED_GATEWAY_ALLOWLIST_NAME,
  fallbackWebAiHealthReceipt,
  fetchWebAiHealthReceipt,
  isValidWebAiHealthReceipt,
  summarizeWebAiHealthFailures,
} from './run-web-ai-health.mjs';

function healthyReceipt() {
  const receipt = fallbackWebAiHealthReceipt('fixture');
  return {
    ...receipt,
    status: 'passed',
    results: receipt.results.map(result => ({
      ...result,
      ok: true,
      failureCause: null,
      message: `${result.surface}: non-empty production Gateway response.`,
      durationMs: 12,
    })),
  };
}

test('validates the five-surface redacted production receipt contract', () => {
  const receipt = healthyReceipt();

  assert.equal(isValidWebAiHealthReceipt(receipt), true);
  assert.equal(receipt.results.length, 5);
  assert.equal(receipt.gatewayAllowlist.name, EXPECTED_GATEWAY_ALLOWLIST_NAME);
  assert.match(summarizeWebAiHealthFailures(receipt), /All 5/);
});

test('preserves classified endpoint failures for the signal payload', async () => {
  const receipt = fallbackWebAiHealthReceipt('fixture');
  receipt.results[0].failureCause = 'forbidden_model';
  receipt.results[0].message =
    'web_chat: model rejected as forbidden by gateway allowlist founder-strict-2026-09-17.';

  const result = await fetchWebAiHealthReceipt({
    url: 'https://jov.ie/api/cron/web-ai-health',
    cronSecret: 'test-secret',
    fetchImpl: async () =>
      new Response(JSON.stringify(receipt), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].failureCause, 'forbidden_model');
  assert.match(summarizeWebAiHealthFailures(result), /forbidden/);
});

test('fails closed with the named allowlist when the endpoint is unauthorized', async () => {
  const result = await fetchWebAiHealthReceipt({
    url: 'https://jov.ie/api/cron/web-ai-health',
    cronSecret: 'wrong-secret',
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.gatewayAllowlist.name, EXPECTED_GATEWAY_ALLOWLIST_NAME);
  assert.equal(result.results.length, 5);
  assert.ok(
    result.results.every(item => item.failureCause === 'request_error')
  );
});

test('rejects drift in the allowlist name or surface inventory', () => {
  const receipt = healthyReceipt();

  assert.equal(
    isValidWebAiHealthReceipt({
      ...receipt,
      gatewayAllowlist: { ...receipt.gatewayAllowlist, name: 'drifted' },
    }),
    false
  );
  assert.equal(
    isValidWebAiHealthReceipt({
      ...receipt,
      results: receipt.results.slice(0, 4),
    }),
    false
  );
});
