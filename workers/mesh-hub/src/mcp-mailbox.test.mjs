import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRpc } from './mcp.ts';

for (const oversized of [false, true]) {
  test(`mailbox acknowledgement preserves complete messages (oversized=${oversized})`, async () => {
    const messages = [
      { id: 'first', body: 'a'.repeat(oversized ? 60_000 : 20) },
      { id: 'last', body: 'tail' },
    ];
    const calls = [];
    const out = await handleRpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'mailbox_read', arguments: { ack: true } },
      },
      {
        scope: ['mesh:read', 'mesh:write'],
        backend: async (method, path, body) => {
          calls.push({ method, path, body });
          return { status: 200, json: { messages, nextAfter: 2 } };
        },
        allowWrite: async () => true,
      }
    );
    assert.equal(out.result.isError, oversized);
    const result = JSON.parse(out.result.content[0].text);
    if (oversized) {
      assert.equal(result.code, 'result_too_large');
      assert.equal(calls.length, 1, 'oversized messages remain unacknowledged');
    } else {
      assert.deepEqual(result.messages, messages);
      assert.equal(result.nextAfter, 2);
      assert.deepEqual(
        calls[1].body.ids,
        messages.map(m => m.id)
      );
    }
  });
}
