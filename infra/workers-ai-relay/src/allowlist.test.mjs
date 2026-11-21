import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.ts';

const MODEL = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';
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
  } = {}
) =>
  worker.fetch(
    new Request('https://w.example/v1/chat/completions', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      body: JSON.stringify(body),
    }),
    e
  );

test('refuses models outside the allowlist', async () => {
  const res = await call(env(), {
    body: {
      model: '@cf/meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'x' }],
    },
  });
  assert.equal(res.status, 400);
});

test('admits helpfulness subject and cheap judge (answerer ≠ judge)', async () => {
  const seen = [];
  const e = env({
    AI: {
      run: async model => {
        seen.push(model);
        return { id: 'ok', choices: [] };
      },
    },
  });
  for (const model of ['@cf/zai-org/glm-5.3', '@cf/openai/gpt-oss-120b']) {
    const res = await call(e, {
      body: { model, messages: [{ role: 'user', content: 'x' }] },
    });
    assert.equal(res.status, 200, model);
  }
  assert.deepEqual(seen, ['@cf/zai-org/glm-5.3', '@cf/openai/gpt-oss-120b']);
});

test('refuses the retired strong judge', async () => {
  const res = await call(env(), {
    body: {
      model: '@cf/deepseek-ai/deepseek-v4-pro-0813',
      messages: [{ role: 'user', content: 'x' }],
    },
  });
  assert.equal(res.status, 400);
});
