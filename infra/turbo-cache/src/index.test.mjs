import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.ts';

function bucket() {
  const m = new Map();
  return {
    m,
    async get(k) {
      const v = m.get(k);
      return v
        ? { size: v.data.length, customMetadata: v.meta, body: v.data }
        : null;
    },
    async head(k) {
      const v = m.get(k);
      return v ? { size: v.data.length, customMetadata: v.meta } : null;
    },
    async put(k, body, o) {
      const data = new Uint8Array(await new Response(body).arrayBuffer());
      m.set(k, { data, meta: o?.customMetadata });
    },
  };
}
const env = () => ({
  CACHE: bucket(),
  TURBO_CACHE_RW_TOKEN: 'rw-secret',
  TURBO_CACHE_RO_TOKEN: 'ro-secret',
});
const H = 'a'.repeat(16);
const req = (method, path, token, body) =>
  new Request(`https://x.test${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-length': String(body.length) } : {}),
    },
    body,
  });

test('rejects missing and wrong tokens', async () => {
  const e = env();
  assert.equal(
    (await worker.fetch(req('GET', `/v8/artifacts/${H}`), e)).status,
    401
  );
  assert.equal(
    (await worker.fetch(req('GET', `/v8/artifacts/${H}`, 'nope'), e)).status,
    401
  );
});

test('rw writes, both roles read, ro cannot write', async () => {
  const e = env();
  assert.equal(
    (
      await worker.fetch(
        req('PUT', `/v8/artifacts/${H}`, 'ro-secret', 'data'),
        e
      )
    ).status,
    403
  );
  assert.equal(
    (await worker.fetch(req('GET', `/v8/artifacts/${H}`, 'ro-secret'), e))
      .status,
    404
  );
  assert.equal(
    (
      await worker.fetch(
        req('PUT', `/v8/artifacts/${H}`, 'rw-secret', 'data'),
        e
      )
    ).status,
    202
  );
  const got = await worker.fetch(
    req('GET', `/v8/artifacts/${H}`, 'ro-secret'),
    e
  );
  assert.equal(got.status, 200);
  assert.equal(
    (await worker.fetch(req('HEAD', `/v8/artifacts/${H}`, 'rw-secret'), e))
      .status,
    200
  );
});

test('rejects bad hashes, status and query endpoints', async () => {
  const e = env();
  assert.equal(
    (await worker.fetch(req('GET', '/v8/artifacts/../etc', 'rw-secret'), e))
      .status,
    404
  );
  assert.equal(
    (await worker.fetch(req('GET', '/v8/artifacts/status', 'ro-secret'), e))
      .status,
    200
  );
  await worker.fetch(req('PUT', `/v8/artifacts/${H}`, 'rw-secret', 'data'), e);
  const q = await worker.fetch(
    new Request('https://x.test/v8/artifacts', {
      method: 'POST',
      headers: { authorization: 'Bearer ro-secret' },
      body: JSON.stringify({ hashes: [H, 'b'.repeat(16)] }),
    }),
    e
  );
  const j = await q.json();
  assert.equal(j[H].size, 4);
  assert.equal(j['b'.repeat(16)], null);
});
