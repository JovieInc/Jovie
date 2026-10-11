import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWebAiHealthSignalPayload,
  fileWebAiHealthLinearIssue,
  fingerprintWebAiHealthFailure,
} from './web-ai-health-intake.mjs';

function failedReceipt() {
  return {
    schema: 'jovie-web-ai-health/v1',
    checkedAt: '2026-09-28T07:00:00.000Z',
    environment: 'production',
    status: 'failed',
    signal: { severity: 'high', route: 'bug' },
    gatewayAllowlist: {
      name: 'founder-strict-2026-09-17',
      models: ['zai/glm-5.3', 'zai/glm-5.3-flash'],
    },
    results: [
      {
        surface: 'web_chat',
        model: 'zai/glm-5.3',
        ok: false,
        failureCause: 'forbidden_model',
        message:
          'web_chat: model rejected as forbidden by gateway allowlist founder-strict-2026-09-17.',
        durationMs: 12,
      },
    ],
  };
}

test('builds a high-severity bug signal with allowlist attribution', () => {
  const payload = buildWebAiHealthSignalPayload(
    failedReceipt(),
    'https://github.com/JovieInc/Jovie/actions/runs/123'
  );

  assert.match(payload.title, /^High: Web AI health forbidden_model/);
  assert.match(payload.description, /Severity: high/);
  assert.match(payload.description, /Route: bug/);
  assert.match(payload.description, /founder-strict-2026-09-17/);
  assert.match(payload.description, /forbidden_model/);
});

test('fingerprints cause and surface so distinct outages route separately', () => {
  const forbidden = failedReceipt();
  const empty = {
    ...forbidden,
    results: [
      {
        ...forbidden.results[0],
        failureCause: 'empty_stream',
      },
    ],
  };

  assert.notEqual(
    fingerprintWebAiHealthFailure(forbidden),
    fingerprintWebAiHealthFailure(empty)
  );
});

test('files at Linear high priority in Todo and reopens recurring failures', async () => {
  /** @type {Array<{ priority?: number; createStateName?: string; reopenTerminal?: boolean }>} */
  const inputs = [];
  const result = await fileWebAiHealthLinearIssue({
    receipt: failedReceipt(),
    runUrl: 'https://example.test/run',
    upsertImpl: async value => {
      inputs.push(value);
      return /** @type {const} */ ({
        ok: true,
        action: 'created',
        id: null,
        identifier: null,
        url: null,
      });
    },
  });

  assert.equal(result.ok, true);
  const input = inputs[0];
  assert.ok(input);
  assert.equal(input.priority, 2);
  assert.equal(input.createStateName, 'Todo');
  assert.equal(input.reopenTerminal, true);
});
