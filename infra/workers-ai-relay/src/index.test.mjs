import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { normalizeFrame } from './index.ts';

const MODEL = '@cf/zai-org/glm-5.3-flash';
const env = (over = {}) => ({
  WORKERS_AI_BEARER: 'secret',
  AI: { run: async () => ({ id: 'x', choices: [] }) },
  ...over,
});
const call = (
  e,
  {
    auth = 'Bearer secret',
    body = { model: MODEL, messages: [{ role: 'user', content: 'hi' }] },
    path = '/v1/chat/completions',
  } = {}
) =>
  worker.fetch(
    new Request('https://w.example' + path, {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      body: JSON.stringify(body),
    }),
    e
  );

test('rejects missing and wrong bearer', async () => {
  assert.equal((await call(env(), { auth: '' })).status, 401);
  assert.equal((await call(env(), { auth: 'Bearer nope' })).status, 401);
  assert.equal((await call(env({ WORKERS_AI_BEARER: undefined }))).status, 401);
});
test('refuses models outside the allowlist', async () => {
  const res = await call(env(), {
    body: {
      model: '@cf/meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'x' }],
    },
  });
  assert.equal(res.status, 400);
});
test('caps output tokens and forwards tools', async () => {
  let seen;
  const res = await call(
    env({
      AI: {
        run: async (m, i) => {
          seen = [m, i];
          return { ok: 1 };
        },
      },
    }),
    {
      body: {
        model: MODEL,
        max_tokens: 99999,
        tools: [{ type: 'function' }],
        messages: [{ role: 'user', content: 'x' }],
      },
    }
  );
  assert.equal(res.status, 200);
  assert.equal(seen[1].max_tokens, 16384);
  assert.equal(seen[1].tools.length, 1);
});
test('rate limit returns 429', async () => {
  const res = await call(
    env({ LIMITER: { limit: async () => ({ success: false }) } })
  );
  assert.equal(res.status, 429);
});
test('normalizes usage frames', () => {
  const delta =
    'data: ' +
    JSON.stringify({
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 0 },
      p: 'x',
    });
  assert.equal(
    JSON.parse(normalizeFrame(delta, MODEL).slice(6)).usage,
    undefined
  );
  const last =
    'data: ' +
    JSON.stringify({
      response: '',
      usage: { prompt_tokens: 14, completion_tokens: 8, total_tokens: 22 },
    });
  const out = JSON.parse(normalizeFrame(last, MODEL).slice(6));
  assert.deepEqual(out.choices, []);
  assert.equal(out.usage.completion_tokens, 8);
  assert.equal(normalizeFrame('data: [DONE]', MODEL), 'data: [DONE]');
});

const EMB = '@cf/baai/bge-m3';
const embCall = (e, body) => call(e, { path: '/v1/embeddings', body });
const embEnv = seen =>
  env({
    AI: {
      run: async (m, i) => {
        seen?.push([m, i]);
        return {
          shape: [i.text.length, 2],
          data: i.text.map((_, k) => [k, 0.5]),
        };
      },
    },
  });

test('embeddings: OpenAI shape, batches of 100, empty strings padded', async () => {
  const seen = [];
  const input = Array.from({ length: 230 }, (_, i) => (i === 3 ? '' : 't' + i));
  const res = await embCall(embEnv(seen), { model: EMB, input });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.object, 'list');
  assert.equal(out.data.length, 230);
  assert.deepEqual(out.data[5], {
    object: 'embedding',
    index: 5,
    embedding: [5, 0.5],
  });
  assert.deepEqual(
    seen.map(([, i]) => i.text.length),
    [100, 100, 30]
  );
  assert.equal(seen[0][1].text[3], ' ');
  assert.equal(seen[0][1].truncate_inputs, true);
  assert.ok(out.usage.prompt_tokens > 0);
});
test('embeddings: string input and base64 encoding', async () => {
  const res = await embCall(embEnv(), {
    model: EMB,
    input: 'hi',
    encoding_format: 'base64',
  });
  const out = await res.json();
  const buf = Buffer.from(out.data[0].embedding, 'base64');
  assert.deepEqual(
    [...new Float32Array(buf.buffer, buf.byteOffset, 2)],
    [0, 0.5]
  );
});
test('embeddings: rejects chat models, wrong dims, bad input, no auth', async () => {
  assert.equal(
    (await embCall(embEnv(), { model: MODEL, input: 'x' })).status,
    400
  );
  assert.equal(
    (await embCall(embEnv(), { model: EMB, input: 'x', dimensions: 768 }))
      .status,
    400
  );
  assert.equal(
    (await embCall(embEnv(), { model: EMB, input: [1] })).status,
    400
  );
  assert.equal(
    (await embCall(embEnv(), { model: EMB, input: [] })).status,
    400
  );
  const res = await call(embEnv(), {
    auth: '',
    path: '/v1/embeddings',
    body: { model: EMB, input: 'x' },
  });
  assert.equal(res.status, 401);
});
test('embeddings: chat allowlist does not admit embedding models', async () => {
  const res = await call(env(), {
    body: { model: EMB, messages: [{ role: 'user', content: 'x' }] },
  });
  assert.equal(res.status, 400);
});
test('embeddings: packs by size and bisects on context-window errors', async () => {
  const seen = [];
  const e = env({
    AI: {
      run: async (m, i) => {
        const chars = i.text.reduce((n, t) => n + t.length, 0);
        seen.push(i.text.length);
        if (chars > 50_000)
          throw new Error(
            '5021: exceeded this model context window limit (60000).'
          );
        return { data: i.text.map(() => [1]) };
      },
    },
  });
  const res = await embCall(e, {
    model: EMB,
    input: Array.from({ length: 60 }, () => 'x'.repeat(4000)),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.length, 60);
  assert.ok(seen.every(n => n <= 30));
});
