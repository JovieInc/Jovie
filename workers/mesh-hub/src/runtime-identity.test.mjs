import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { MailboxStore, sha256Hex } from './core.ts';
import { Outbox } from './outbox.ts';

// Exercise the real DO methods and SQLite stores; only the platform base is stubbed.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: `data:text/javascript,${encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }')}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
globalThis.WebSocketRequestResponsePair = class {};
const { Mailbox } = await import('./mailbox.ts');
const { Registry } = await import('./registry.ts');

function context() {
  const db = new DatabaseSync(':memory:');
  let alarm = null;
  const sql = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const rows = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i.test(query)
        ? statement.all(...bindings)
        : (statement.run(...bindings), []);
      return { toArray: () => rows.map(row => ({ ...row })) };
    },
  };
  return {
    storage: {
      sql,
      getAlarm: async () => alarm,
      setAlarm: async value => {
        alarm = value;
      },
    },
    setWebSocketAutoResponse() {},
    getWebSockets: () => [],
  };
}

async function fixture(
  kinds,
  kind = 'codex',
  correlationId = 'runtime-identity-test'
) {
  const ctx = context();
  const replies = [];
  const events = [];
  let modelCalls = 0;
  const env = {
    EXECUTOR_KINDS: kinds,
    EXECUTOR_GRACE_MS: '0',
    AI: {
      run: async () => {
        modelCalls++;
        return { response: 'read-only stand-in reply' };
      },
    },
    MAILBOX: {
      idFromName: kind => kind,
      get: () => ({
        enqueue: async message => {
          replies.push(message);
          return { ok: true };
        },
      }),
    },
    REGISTRY: {
      idFromName: kind => kind,
      get: () => ({ recordEvent: async (...event) => events.push(event) }),
    },
  };
  const mailbox = new Mailbox(ctx, env);
  await mailbox.configure({
    kind,
    fallback: 'summer',
    deadAfterMs: 86_400_000,
  });
  const message = {
    id: `claude:${correlationId}`,
    from: 'claude',
    to: kind,
    correlationId,
    sha256: await sha256Hex('report status'),
    body: 'report status',
    refs: [],
    inReplyTo: null,
    sentAt: null,
    acceptedAt: Date.now() - 30_000,
    kind: 'message',
  };
  await mailbox.enqueue(message);
  return {
    ctx,
    env,
    mailbox,
    message,
    replies,
    events,
    modelCalls: () => modelCalls,
    store: new MailboxStore(ctx.storage.sql),
    outbox: new Outbox(ctx.storage.sql),
  };
}

test('production config disables every stand-in and leaves real mail available', async () => {
  const config = readFileSync(
    new URL('../wrangler.toml', import.meta.url),
    'utf8'
  );
  const kinds = config.match(/^EXECUTOR_KINDS = "([^"]*)"$/m)?.[1];
  assert.equal(kinds, '');
  const f = await fixture(kinds);
  assert.equal(f.outbox.dueTasks(Date.now()).includes('exec'), false);
  await f.mailbox.alarm();
  assert.equal(f.modelCalls(), 0);
  assert.deepEqual(
    f.store.claim(Date.now()).map(message => message.id),
    [f.message.id]
  );
});

test('disabling a stand-in cancels a persisted exec alarm without claiming or acking mail', async () => {
  const f = await fixture('codex');
  f.env.EXECUTOR_KINDS = '';
  assert.ok(f.outbox.dueTasks(Date.now()).includes('exec'));
  await f.mailbox.alarm();
  assert.equal(f.modelCalls(), 0);
  assert.equal(f.replies.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(f.store.unackedCount(), 1);
  assert.deepEqual(
    f.store.claim(Date.now()).map(message => message.id),
    [f.message.id]
  );
  assert.equal(f.outbox.dueTasks(Date.now()).includes('exec'), false);
});

test('an explicitly enabled stand-in sends with the reserved hub identity', async () => {
  const f = await fixture('codex');
  await f.mailbox.alarm();
  assert.equal(f.modelCalls(), 1);
  assert.equal(f.replies.length, 1);
  const reply = f.replies[0];
  assert.equal(reply.from, 'mesh-hub');
  assert.equal(reply.id, `mesh-hub:${reply.correlationId}`);
  assert.equal(reply.inReplyTo, f.message.id);
  assert.equal(reply.to, 'claude');
  assert.match(reply.body, /^\[hub-executor:workers-ai for codex\]/);
});

test('registry never turns relay presence or a stand-in into verified runtime capability', async () => {
  for (const fails of [false, true]) {
    const ctx = context();
    const env = {
      AI: {},
      EXECUTOR_KINDS: 'codex',
      MAILBOX: {
        idFromName: kind => kind,
        get: () => ({
          liveness: async () => {
            if (fails) throw new Error('mailbox unavailable');
            return {
              connected: 1,
              lastPingAt: Date.now(),
              unhandled: 0,
              oldestUnhandledAgeMs: null,
            };
          },
        }),
      },
    };
    const registry = new Registry(ctx, env);
    ctx.storage.sql.exec(
      'INSERT INTO agents (kind, token_sha256, state, updated_at) VALUES (?, ?, ?, ?)',
      'codex',
      '0'.repeat(64),
      'ok',
      Date.now()
    );
    const { agents } = await registry.status();
    assert.equal(agents[0].canHandle, false);
    assert.equal(agents[0].runtimeVerification, 'unverified');
    assert.equal(agents[0].executorAvailable, true);
    assert.equal(agents[0].connected, fails ? null : 1);
    assert.equal(
      agents[0].state,
      'ok',
      'state remains transport presence only'
    );
  }
});

test('hub reply identities do not collide across target kind and original correlation boundaries', async () => {
  const first = await fixture('codex', 'codex', 'lola-abcdefgh');
  const second = await fixture('codex-lola', 'codex-lola', 'abcdefgh');
  await first.mailbox.alarm();
  await second.mailbox.alarm();
  assert.equal(first.replies.length, 1);
  assert.equal(second.replies.length, 1);
  const recipient = new MailboxStore(context().storage.sql);
  assert.equal(recipient.enqueue(first.replies[0]).ok, true);
  assert.equal(recipient.enqueue(second.replies[0]).ok, true);
  assert.equal(recipient.unackedCount(), 2);
  assert.notEqual(first.replies[0].id, second.replies[0].id);
});
