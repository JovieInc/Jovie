import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const state = mkdtempSync(join(tmpdir(), 'mesh-worker-test-'));
Object.assign(process.env, {
  MESH_KIND: 'aeon',
  MESH_HUB_TOKEN_AEON: 'fixture-only',
  CODEX_BIN: '/actual/codex',
  MESH_STATE_DIR: state,
});
const worker = await import('./mesh-worker.mjs');
after(() => rmSync(state, { recursive: true, force: true }));
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
function responses(values, calls) {
  globalThis.fetch = async (_url, options) => {
    calls.push({
      url: _url,
      ...options,
      body: options.body && JSON.parse(options.body),
    });
    const value = values.shift();
    return { status: value.status ?? 200, json: async () => value };
  };
}
const message = id => ({
  id,
  from: 'claude',
  kind: 'message',
  body: 'nonce real-123',
  correlationId: id,
});
test('SSH retains actual executor and shell-quotes trusted config without credential transfer', () => {
  const command = worker.executorCommand(
    '/actual/codex',
    ['exec', '-o', '/tmp/output'],
    "/path/with quote's",
    '/tmp/output',
    'timwhite@100.106.27.46'
  );
  assert.equal(command.binary, '/usr/bin/ssh');
  assert.deepEqual(command.args.slice(0, 6), [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    'timwhite@100.106.27.46',
  ]);
  assert.match(command.args[6], /'\/actual\/codex' 'exec'/);
  assert.ok(command.args[6].includes("'\"'\"'"));
  assert.ok(!command.args.join(' ').includes('fixture-only'));
  assert.deepEqual(
    worker.executorCommand('/codex', ['exec'], '/state', '/out'),
    { binary: '/codex', args: ['exec'], remote: false }
  );
});
test('hash covers the exact truncated outbound body and reply id is stable', async () => {
  const calls = [];
  responses([{ ok: true }, { ok: true }], calls);
  await worker.send('claude', 'x'.repeat(5000), 'claude:1');
  await worker.send('claude', 'x'.repeat(5000), 'claude:1');
  assert.equal(calls[0].body.body.length, 3900);
  assert.equal(
    calls[0].body.sha256,
    createHash('sha256').update(calls[0].body.body).digest('hex')
  );
  assert.equal(calls[0].body.correlationId, calls[1].body.correlationId);
});
test('real executor result is preserved across send failure and retry', async () => {
  const calls = [];
  responses([{ ok: false, status: 503 }, { ok: true }], calls);
  let executions = 0;
  const execute = async prompt => {
    executions++;
    assert.match(prompt, /office MacBook Air/);
    return { code: 0, text: 'Aeon real-123' };
  };
  await assert.rejects(
    worker.handle(message('claude:retry'), execute),
    /reply failed/
  );
  await worker.handle(message('claude:retry'), execute);
  assert.equal(executions, 1);
  assert.equal(calls[1].body.body, 'Aeon real-123');
  assert.equal(calls[1].body.inReplyTo, 'claude:retry');
});
test('failed runtime never fabricates an answer', async () => {
  const calls = [];
  responses([], calls);
  await assert.rejects(
    worker.handle(message('claude:fail'), async () => ({ code: 1, text: '' })),
    /executor failed/
  );
  assert.equal(calls.length, 0);
});
test('untrusted callers, replies, probes and malformed board notices do not execute', async () => {
  let calls = 0;
  const execute = async () => {
    calls++;
  };
  for (const m of [
    { ...message('1'), from: 'codex' },
    { ...message('2'), inReplyTo: 'old' },
    { ...message('3'), kind: 'probe' },
    { ...message('4'), correlationId: 'reply-old' },
    { from: 'board', body: '{' },
    { from: 'board', body: JSON.stringify({ event: 'closed' }) },
  ])
    await worker.handle(m, execute);
  assert.equal(calls, 0);
});
test('trusted board work still claims, executes and posts the result', async () => {
  const calls = [];
  responses([{ ok: true, claimed: true }, { ok: true }], calls);
  await worker.handle(
    {
      from: 'board',
      body: JSON.stringify({
        event: 'task.open',
        task: {
          id: 'task1',
          poster: 'claude',
          caps: ['research'],
          body: 'check',
          title: 'Title',
        },
      }),
    },
    async () => ({ code: 0, text: 'result' })
  );
  assert.equal(calls[0].body.id, 'task1');
  assert.equal(calls[1].body.result, 'result');
  assert.equal(calls[1].body.status, 'done');
});
test('lost board claims never start a runtime and failed runtime reports failed', async () => {
  const calls = [];
  responses([{ ok: false }, { ok: true, claimed: true }, { ok: true }], calls);
  await worker.workTask({ id: 'lost' }, () => {
    throw Error('should not run');
  });
  await worker.workTask({ id: 'failed' }, async () => ({ code: 1, text: '' }));
  assert.equal(calls[2].body.status, 'failed');
});
test('canonical local runtime strips mesh credentials and captures actual final output', async () => {
  const result = await worker.codex(
    'hello',
    undefined,
    (binary, args, options) => {
      assert.equal(binary, '/actual/codex');
      assert.equal(options.env.MESH_HUB_TOKEN_AEON, undefined);
      assert.ok(args.includes('read-only'));
      const child = new EventEmitter();
      child.pid = 123;
      child.stdin = {
        end(prompt) {
          assert.equal(prompt, 'hello');
          setImmediate(() => {
            writeFileSync(args.at(-1), 'runtime final');
            child.emit('close', 0);
          });
        },
      };
      return child;
    }
  );
  assert.deepEqual(result, { code: 0, text: 'runtime final' });
});
test('missing executor is a typed failure', async () => {
  const result = await worker.codex('hello', undefined, () => {
    const child = new EventEmitter();
    child.pid = 124;
    child.stdin = {
      end() {
        setImmediate(() => child.emit('error', Error('ENOENT')));
      },
    };
    return child;
  });
  assert.deepEqual(result, { code: -1, text: '' });
});

test('incoming work is acknowledged only after real result delivery, with in-flight dedupe', async () => {
  const calls = [];
  responses([{ ok: true }, { ok: true }, { ok: true }], calls);
  let finish;
  const pending = worker.processMessage(
    message('claude:pending'),
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  assert.equal(await worker.processMessage(message('claude:pending')), false);
  assert.equal(calls.length, 0);
  finish({ code: 0, text: 'real result' });
  assert.equal(await pending, true);
  assert.match(calls[1].url, /\/v1\/ack$/);
  assert.equal(await worker.processMessage(message('claude:pending')), true);
  assert.match(calls[2].url, /\/v1\/ack$/);
});
test('failed receive remains unhandled', async () => {
  const calls = [];
  responses([], calls);
  assert.equal(
    await worker.processMessage(message('claude:fail-receive'), async () => ({
      code: 1,
      text: '',
    })),
    false
  );
  assert.equal(calls.length, 0);
});
test('remote runtime output comes from SSH stdout and keeps the canonical remote command', async () => {
  const result = await worker.codex(
    'nonce-remote',
    undefined,
    (binary, args, options) => {
      assert.equal(binary, '/usr/bin/ssh');
      assert.match(args.at(-1), /'\/actual\/codex'/);
      assert.ok(!JSON.stringify(options.env).includes('fixture-only'));
      const child = new EventEmitter();
      child.pid = 125;
      child.stdout = new EventEmitter();
      child.stdin = {
        end(prompt) {
          assert.equal(prompt, 'nonce-remote');
          setImmediate(() => {
            child.stdout.emit('data', Buffer.from('actual remote output'));
            child.emit('close', 0);
          });
        },
      };
      return child;
    },
    'timwhite@100.106.27.46'
  );
  assert.deepEqual(result, { code: 0, text: 'actual remote output' });
});
test('board lease is renewed while the actual executor runs', async () => {
  const calls = [];
  responses([{ ok: true, claimed: true }, { ok: true }, { ok: true }], calls);
  await worker.workTask({ id: 'beat' }, async (_prompt, beat) => {
    await beat();
    return { code: 0, text: 'done' };
  });
  assert.match(calls[1].url, /\/v1\/board\/update$/);
});

test('startup caps failures recover through the existing loop before mailbox consumption', async () => {
  const controller = new AbortController();
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    if (urls.length === 1) throw Error('EHOSTUNREACH');
    if (urls.length === 2)
      return { status: 403, json: async () => ({ ok: false }) };
    if (urls.length === 4) controller.abort();
    return { status: 200, json: async () => ({ ok: true, messages: [] }) };
  };
  let waits = 0;
  await worker.loop({
    signal: controller.signal,
    wait: async () => {
      waits++;
    },
  });
  assert.equal(waits, 2);
  assert.equal(urls.length, 4);
  assert.ok(urls.slice(0, 3).every(url => url.endsWith('/v1/board/caps')));
  assert.ok(urls[3].includes('/v1/mailbox'));
});

test('uncertain runtime outcome holds redelivery without another dispatch', async () => {
  let executions = 0;
  const execute = async () => {
    executions++;
    throw Error('uncertain SSH completion');
  };
  await assert.rejects(
    worker.handle(message('claude:unknown'), execute),
    /uncertain SSH/
  );
  await assert.rejects(
    worker.handle(message('claude:unknown'), execute),
    /runtime outcome unknown/
  );
  assert.equal(executions, 1);
});

test('durable started state precedes dispatch and completion atomically replaces it', async () => {
  const calls = [];
  responses([{ ok: true }], calls);
  const id = 'claude:checkpoint';
  const path = join(
    state,
    `reply-${createHash('sha256').update(id).digest('hex')}.json`
  );
  await worker.handle(message(id), async () => {
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(saved.status, 'runtime_started');
    assert.equal(saved.messageId, id);
    return { code: 0, text: 'completed real output' };
  });
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(saved.status, 'reply');
  assert.equal(saved.text, 'completed real output');
  assert.equal(existsSync(path + '.tmp'), false);
});

test('completed legacy reply survives upgrade without dispatch', async () => {
  const id = 'claude:legacy-reply';
  const path = join(
    state,
    `reply-${createHash('sha256').update(id).digest('hex')}.txt`
  );
  writeFileSync(path, 'already generated');
  const calls = [];
  responses([{ ok: true }], calls);
  await worker.handle(message(id), () => {
    throw Error('must not dispatch');
  });
  assert.equal(calls[0].body.body, 'already generated');
});
