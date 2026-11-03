import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, {
  ALLOWED_MODELS,
  EMBEDDING_MODELS,
  normalizeFrame,
  normalizeSse,
} from './index.ts';

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

test('normalizeFrame: records the upstream completion id and reuses it', () => {
  const identity = {};
  const delta =
    'data: ' +
    JSON.stringify({
      id: 'chatcmpl-upstream-9',
      object: 'chat.completion.chunk',
      choices: [{ delta: { content: 'hi' } }],
    });
  const passed = normalizeFrame(delta, MODEL, identity);
  assert.equal(JSON.parse(passed.slice(6)).id, 'chatcmpl-upstream-9');
  assert.equal(identity.completionId, 'chatcmpl-upstream-9');
  // First id is sticky: a later different upstream id does not move it.
  normalizeFrame(
    'data: ' +
      JSON.stringify({
        id: 'chatcmpl-other',
        choices: [{ delta: { content: '!' } }],
      }),
    MODEL,
    identity
  );
  assert.equal(identity.completionId, 'chatcmpl-upstream-9');
  const usage =
    'data: ' +
    JSON.stringify({
      response: '',
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
  const finalChunk = JSON.parse(
    normalizeFrame(usage, MODEL, identity).slice(6)
  );
  assert.equal(finalChunk.id, 'chatcmpl-upstream-9');
  assert.equal(finalChunk.usage.total_tokens, 5);
});

test('normalizeFrame: no identity seen keeps the stable fallback id', () => {
  const usage =
    'data: ' +
    JSON.stringify({
      response: '',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  assert.equal(
    JSON.parse(normalizeFrame(usage, MODEL, {}).slice(6)).id,
    'chatcmpl-wai'
  );
  // Two-argument callers (no state) keep the same behavior.
  assert.equal(
    JSON.parse(normalizeFrame(usage, MODEL).slice(6)).id,
    'chatcmpl-wai'
  );
});

const collectFrames = async (model, chunks) => {
  const encoder = new TextEncoder();
  const source = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const reader = source.pipeThrough(normalizeSse(model)).getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value, { stream: true });
  }
  return text
    .split('\n\n')
    .map(frame => frame.trim())
    .filter(Boolean);
};

const chunk = obj => 'data: ' + JSON.stringify(obj) + '\n\n';

test('normalizeSse: one identity across text, tool and usage frames (JOV-10361)', async () => {
  const id = 'chatcmpl-abc123';
  const textFrame = chunk({
    id,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: 'hel' } }],
    usage: { prompt_tokens: 1 },
  });
  const toolFrame = chunk({
    id,
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'noop', arguments: '{}' },
            },
          ],
        },
      },
    ],
    p: 'x',
  });
  const finalFrame = chunk({
    response: '',
    usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
  });
  const done = 'data: [DONE]\n\n';
  // Mixed transport boundaries: two frames in one chunk, then one frame split
  // across three chunks mid-JSON, then the terminal frame alone.
  const frames = await collectFrames(MODEL, [
    textFrame + toolFrame,
    finalFrame.slice(0, 11),
    finalFrame.slice(11, 40),
    finalFrame.slice(40),
    done,
  ]);
  assert.equal(frames.length, 4);
  const [text, tool, usage] = frames
    .slice(0, 3)
    .map(f => JSON.parse(f.slice(6)));
  assert.equal(text.id, id);
  assert.equal(text.choices[0].delta.content, 'hel');
  assert.equal(text.usage, undefined);
  assert.equal(tool.id, id);
  assert.deepEqual(tool.choices[0].delta.tool_calls[0].function, {
    name: 'noop',
    arguments: '{}',
  });
  assert.equal(tool.p, undefined);
  // The final usage-only chunk reuses the upstream identity, not chatcmpl-wai.
  assert.equal(usage.id, id);
  assert.deepEqual(usage.choices, []);
  assert.equal(usage.usage.total_tokens, 46);
  assert.equal(frames[3], 'data: [DONE]');
  // Every completion frame in the stream shares one identity.
  assert.ok(
    frames.every(f => f === 'data: [DONE]' || JSON.parse(f.slice(6)).id === id)
  );
});

test('normalizeSse: concurrent streams never share identity', async () => {
  const stream = (id, token) =>
    collectFrames(MODEL, [
      chunk({
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: token } }],
      }) +
        chunk({
          response: '',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
    ]);
  const [a, b] = await Promise.all([
    stream('chatcmpl-stream-a', 'a'),
    stream('chatcmpl-stream-b', 'b'),
  ]);
  const idOf = frames => frames.map(f => JSON.parse(f.slice(6)).id);
  assert.deepEqual(idOf(a), ['chatcmpl-stream-a', 'chatcmpl-stream-a']);
  assert.deepEqual(idOf(b), ['chatcmpl-stream-b', 'chatcmpl-stream-b']);
});

test('normalizeSse: missing upstream identity falls back per stream', async () => {
  const frames = await collectFrames(MODEL, [
    chunk({
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: 'x' } }],
    }) +
      chunk({
        response: '',
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
      }),
  ]);
  assert.equal(frames.length, 2);
  const usage = JSON.parse(frames[1].slice(6));
  assert.equal(usage.id, 'chatcmpl-wai');
  assert.equal(usage.usage.prompt_tokens, 7);
});

test('normalizeSse: empty-choices deltas are dropped, junk passes through', async () => {
  const frames = await collectFrames(MODEL, [
    chunk({ id: 'chatcmpl-x', choices: [] }) +
      'data: not-json\n\n' +
      chunk({
        id: 'chatcmpl-x',
        choices: [{ index: 0, delta: { content: 'y' } }],
      }) +
      chunk({
        response: '',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
  ]);
  assert.deepEqual(frames, [
    'data: not-json',
    'data: ' +
      JSON.stringify({
        id: 'chatcmpl-x',
        choices: [{ index: 0, delta: { content: 'y' } }],
      }),
    'data: ' +
      JSON.stringify({
        id: 'chatcmpl-x',
        object: 'chat.completion.chunk',
        model: MODEL,
        choices: [],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      }),
  ]);
});

const EMB = '@cf/baai/bge-m3';
const embCall = (e, body) => call(e, { path: '/v1/embeddings', body });

const get = (e, path, auth = 'Bearer secret') =>
  worker.fetch(
    new Request('https://w.example' + path, {
      headers: auth ? { authorization: auth } : {},
    }),
    e
  );

test('health, models, unknown routes and wrong methods', async () => {
  assert.equal((await get(env(), '/health', '')).status, 200);
  const models = await (await get(env(), '/v1/models')).json();
  assert.deepEqual(
    models.data.map(m => m.id),
    [...ALLOWED_MODELS, ...EMBEDDING_MODELS.keys()]
  );
  assert.equal((await get(env(), '/nope')).status, 404);
  assert.equal((await get(env(), '/v1/chat/completions')).status, 405);
  assert.equal((await get(env(), '/v1/embeddings')).status, 405);
});

test('non-stream chat completions pass the JSON result through', async () => {
  const res = await call(
    env({
      AI: {
        run: async () => ({
          id: 'chatcmpl-plain',
          choices: [{ message: { role: 'assistant', content: 'hi' } }],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        }),
      },
    })
  );
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.id, 'chatcmpl-plain');
  assert.equal(out.usage.total_tokens, 3);
});

test('chat upstream errors map to 429, 404 and 502', async () => {
  const fail = message =>
    call(
      env({
        AI: {
          run: async () => {
            throw new Error(message);
          },
        },
      })
    );
  assert.equal((await fail('rate limit exceeded')).status, 429);
  assert.equal((await fail('no such model')).status, 404);
  assert.equal((await fail('boom')).status, 502);
});

test('oversized and malformed chat bodies are rejected', async () => {
  const res = await worker.fetch(
    new Request('https://w.example/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-length': String(16 * 1024 * 1024),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'x' }],
      }),
    }),
    env()
  );
  assert.equal(res.status, 413);
  const bad = await worker.fetch(
    new Request('https://w.example/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: 'not json',
    }),
    env()
  );
  assert.equal(bad.status, 400);
  const array = await worker.fetch(
    new Request('https://w.example/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: '[]',
    }),
    env()
  );
  assert.equal(array.status, 400);
});

test('embeddings: own rate-limit bucket returns 429', async () => {
  const res = await embCall(
    env({
      EMBED_LIMITER: { limit: async () => ({ success: false }) },
    }),
    { model: EMB, input: 'x' }
  );
  assert.equal(res.status, 429);
});
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
