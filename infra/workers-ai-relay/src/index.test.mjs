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
