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
          if (path === '/v1/ack') {
            return {
              status: 200,
              json: { ok: true, acked: body.ids.length },
            };
          }
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
      assert.equal(result.acked, messages.length);
    }
  });
}

test('mailbox acknowledgement reports the hub count and a failed ack', async () => {
  const messages = [
    { id: 'first', body: 'a' },
    { id: 'last', body: 'b' },
  ];
  const partial = await handleRpc(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'mailbox_read', arguments: { ack: true } },
    },
    {
      scope: ['mesh:read', 'mesh:write'],
      backend: async (_method, path) =>
        path === '/v1/ack'
          ? { status: 200, json: { ok: true, acked: 1 } }
          : { status: 200, json: { messages, nextAfter: 2 } },
      allowWrite: async () => true,
    }
  );
  assert.equal(partial.result.isError, false);
  assert.equal(JSON.parse(partial.result.content[0].text).acked, 1);

  const failed = await handleRpc(
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'mailbox_read', arguments: { ack: true } },
    },
    {
      scope: ['mesh:read', 'mesh:write'],
      backend: async (_method, path) =>
        path === '/v1/ack'
          ? { status: 503, json: { ok: false, code: 'unavailable' } }
          : { status: 200, json: { messages, nextAfter: 2 } },
      allowWrite: async () => true,
    }
  );
  assert.equal(failed.result.isError, true);
  const error = JSON.parse(failed.result.content[0].text);
  assert.equal(error.code, 'unavailable');
  assert.equal(error.acked, undefined);

  const unconfirmed = await handleRpc(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'mailbox_read', arguments: { ack: true } },
    },
    {
      scope: ['mesh:read', 'mesh:write'],
      backend: async (_method, path) =>
        path === '/v1/ack'
          ? { status: 200, json: { ok: true } }
          : { status: 200, json: { messages, nextAfter: 2 } },
      allowWrite: async () => true,
    }
  );
  assert.equal(unconfirmed.result.isError, true);
  assert.equal(
    JSON.parse(unconfirmed.result.content[0].text).code,
    'ack_unconfirmed'
  );

  const empty = await handleRpc(
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'mailbox_read', arguments: { ack: true } },
    },
    {
      scope: ['mesh:read', 'mesh:write'],
      backend: async () => ({ status: 200, json: { messages: [] } }),
      allowWrite: async () => true,
    }
  );
  assert.equal(JSON.parse(empty.result.content[0].text).acked, 0);
});
