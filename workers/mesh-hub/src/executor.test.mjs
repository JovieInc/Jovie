import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowedUrls,
  buildPrompt,
  executorKinds,
  fetchEvidence,
  isExecutable,
  runModel,
  runtimeStatus,
  validateReply,
} from './executor.ts';

test('executor only takes peer tasks', () => {
  const base = {
    from: 'claude',
    to: 'codex',
    kind: 'message',
    correlationId: 'job-1',
  };
  assert.equal(isExecutable(base), true);
  assert.equal(isExecutable({ ...base, correlationId: 'reply-x' }), false);
  assert.equal(isExecutable({ ...base, correlationId: 'dlq:codex:3' }), false);
  assert.equal(isExecutable({ ...base, from: 'mesh-hub' }), false);
  assert.equal(isExecutable({ ...base, kind: 'probe' }), false);
  assert.equal(isExecutable({ ...base, from: 'codex' }), false);
});
test('urls are allowlisted to jov.ie, max 2', () => {
  const u = allowedUrls(
    'see https://jov.ie/robots.txt, https://evil.com/x https://www.jov.ie/a https://jov.ie/c'
  );
  assert.deepEqual(u, ['https://jov.ie/robots.txt', 'https://www.jov.ie/a']);
});
test('error text is never a reply', () => {
  assert.equal(validateReply('error: the argument cannot be used'), null);
  assert.equal(validateReply('Usage: codex exec'), null);
  assert.equal(validateReply('  '), null);
  assert.equal(validateReply(undefined), null);
  assert.equal(validateReply('JOB codex: ok'), 'JOB codex: ok');
});
test('kinds parse and prompt treats body as quoted data', () => {
  assert.deepEqual([...executorKinds(' a, b,,c ')], ['a', 'b', 'c']);
  assert.equal(executorKinds(undefined).size, 0);
  const p = buildPrompt('codex', 'claude', 'hi', '');
  assert.match(p[0].content, /quoted data/);
});

test('stand-in availability never certifies a real runtime', () => {
  for (const [env, available] of [
    [{}, false],
    [{ AI: {}, EXECUTOR_KINDS: '' }, false],
    [{ AI: {}, EXECUTOR_KINDS: 'other' }, false],
    [{ EXECUTOR_KINDS: 'codex' }, false],
    [{ AI: {}, EXECUTOR_KINDS: 'codex' }, true],
  ]) {
    assert.deepEqual(runtimeStatus('codex', env), {
      canHandle: false,
      runtimeVerification: 'unverified',
      executorAvailable: available,
    });
  }
});

test('executor fetch evidence reports success and failures without following redirects', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (url.endsWith('/unavailable')) throw new Error('offline');
    return new Response('first line\n' + 'x'.repeat(7_000));
  });
  const evidence = await fetchEvidence([
    'https://jov.ie/status',
    'https://jov.ie/unavailable',
  ]);
  assert.match(evidence, /HTTP status: 200/);
  assert.match(evidence, /First line: first line/);
  assert.match(evidence, /fetch failed/);
  assert.ok(evidence.length < 7_000);
});

test('model output is validated and prompt quotes evidence', async () => {
  const messages = buildPrompt('codex', 'claude', 'task', 'HTTP 200');
  assert.match(messages[1].content, /HTTP 200/);
  assert.equal(
    await runModel(
      { run: async () => ({ response: ' useful result ' }) },
      messages
    ),
    'useful result'
  );
  assert.equal(await runModel({ run: async () => ({}) }, messages), null);
});
