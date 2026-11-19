import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoardStore } from './board.ts';
import {
  BoardMirror,
  MIRROR,
  MIRROR_KEYS,
  mirrorSignature,
  serializeRow,
} from './board-mirror.ts';
import { sqlite } from './core.test.mjs';

const ACTIVE = ['summer', 'claude', 'codex'];

function makeStore() {
  const store = new BoardStore(sqlite());
  store.setCaps('claude', ['research'], 0);
  return store;
}

/** In-memory DO-storage KV stand-in with the get/put shape the mirror uses. */
function kv() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.get(key);
    },
    async put(key, value) {
      map.set(key, value);
    },
  };
}

const source = store => ({
  maxStageId: () => store.maxStageId(),
  rows: (after, limit) => store.mirrorRows(after, limit),
});

function makeMirror(over = {}) {
  const calls = [];
  const holder = over.kv ?? kv();
  const fetchFn =
    over.fetch ??
    (async (...args) => {
      calls.push(args);
      return (
        over.response ?? {
          ok: true,
          status: 200,
          json: async () => ({
            processedThrough: over.processedThrough ?? rowsMax(calls, over),
          }),
        }
      );
    });
  return {
    mirror: new BoardMirror(
      { ...over.env, ...over.opts },
      holder,
      fetchFn,
      over.now ?? (() => 1_000_000)
    ),
    calls,
    kv: holder,
  };
}

/** Default receipt: processed through the last row of the latest request. */
function rowsMax(calls, over) {
  if (over.processedThrough !== undefined) return over.processedThrough;
  const last = calls.at(-1);
  const body = JSON.parse(last[1].body);
  const rows = body.rows;
  return rows.length ? rows[rows.length - 1].stageId : 0;
}

function seed(store, count, startAt = 1, prefix = 't') {
  for (let i = 0; i < count; i++)
    store.post(
      'summer',
      { id: `${prefix}${i}`, title: `task ${prefix}${i}` },
      ACTIVE,
      startAt + i
    );
}

test('disabled mirror: no fetch, no KV writes, status reports enabled false', async () => {
  for (const env of [{}, { url: 'https://x' }, { secret: 's' }]) {
    const store = makeStore();
    seed(store, 2);
    const holder = kv();
    const { mirror, calls } = makeMirror({ env, kv: holder });
    assert.equal(mirror.enabled, false);
    await mirror.drain(source(store));
    assert.deepEqual(calls, []);
    assert.deepEqual([...holder.map.keys()], []);
    const status = await mirror.status(source(store));
    assert.equal(status.enabled, false);
    assert.equal(status.cursor, null);
    assert.equal(status.backlog, null);
  }
});

test('first enable sets the cursor to the current max stage id: no backfill, no post', async () => {
  const store = makeStore();
  seed(store, 3);
  const {
    mirror,
    calls,
    kv: holder,
  } = makeMirror({ env: { url: 'u', secret: 's' } });
  await mirror.drain(source(store));
  assert.deepEqual(calls, []);
  assert.equal(await holder.get(MIRROR_KEYS.cursor), store.maxStageId());
  // Everything before the cursor stays unmirrored.
  await mirror.drain(source(store));
  assert.deepEqual(calls, []);
});

test('drain posts batches of 50, honors partial processedThrough and advances the cursor', async () => {
  const store = makeStore();
  const { mirror, kv: holder } = makeMirror({
    env: { url: 'u', secret: 's' },
  });
  await mirror.drain(source(store)); // arms the cursor at 0
  seed(store, 120);
  const receipts = [];
  // Receiver processes 50, then 40 (partial), then the rest.
  let n = 0;
  const firstPostBodies = [];
  const m2 = makeMirror({
    env: { url: 'u', secret: 's' },
    kv: holder,
    fetch: async (_url, init) => {
      firstPostBodies.push(init.body);
      const through = [50, 90, 120][n++] ?? 120;
      receipts.push(through);
      return {
        ok: true,
        status: 200,
        json: async () => ({ processedThrough: through }),
      };
    },
  });
  // Receiver processed 50, then 40 (a partial batch stops the drain), then the rest.
  const first = await m2.mirror.drain(source(store));
  assert.equal(first.posted, 2);
  assert.deepEqual(receipts, [50, 90]);
  assert.equal(await holder.get(MIRROR_KEYS.cursor), 90);
  const second = await m2.mirror.drain(source(store));
  assert.equal(second.posted, 1);
  assert.deepEqual(receipts, [50, 90, 120]);
  assert.equal(await holder.get(MIRROR_KEYS.cursor), 120);
  assert.equal(JSON.parse(firstPostBodies[0]).rows.length, MIRROR.batchRows);
  // Rows are in stage-id order and joined to their task.
  const sent = JSON.parse(firstPostBodies[0]).rows;
  for (let i = 1; i < sent.length; i++)
    assert.ok(sent[i - 1].stageId < sent[i].stageId);
  assert.equal(sent[0].taskId, 't0');
  assert.equal(sent[0].type, 'task');
  assert.equal(sent[0].title, 'task t0');
  assert.equal(sent[0].poster, 'summer');
  assert.equal(sent[0].status, 'open');
  assert.equal(sent[0].stage, 'posted');
  // A settled board drains nothing.
  const quiet = await m2.mirror.drain(source(store));
  assert.equal(quiet.posted, 0);
});

test('a failed post leaves the cursor in place and records the failure', async () => {
  const store = makeStore();
  seed(store, 3);
  const holder = kv();
  const failing = makeMirror({
    env: { url: 'u', secret: 's' },
    kv: holder,
    fetch: async () => {
      throw new Error('fetch boom');
    },
  });
  await failing.mirror.drain(source(store)); // cursor armed at max
  seed(store, 2, 10, 'u');
  const out = await failing.mirror.drain(source(store));
  assert.equal(out.failed, true);
  assert.equal(out.posted, 0);
  assert.equal(await holder.get(MIRROR_KEYS.cursor), 3);
  const status = await failing.mirror.status(source(store));
  assert.equal(status.failures, 1);
  assert.equal(status.lastErrorCode, 'fetch boom');
  assert.ok(status.lastErrorAt);
  assert.equal(status.posts, 0);
  // Non-OK HTTP is a failure too.
  const httpFail = makeMirror({
    env: { url: 'u', secret: 's' },
    kv: holder,
    response: { ok: false, status: 500, json: async () => ({}) },
  });
  const out2 = await httpFail.mirror.drain(source(store));
  assert.equal(out2.failed, true);
  assert.equal(
    (await httpFail.mirror.status(source(store))).lastErrorCode,
    'mirror_http_500'
  );
});

test('backlog over 1000 rows skips ahead and counts the skipped rows', async () => {
  const store = makeStore();
  seed(store, 5);
  const holder = kv();
  const { mirror } = makeMirror({ env: { url: 'u', secret: 's' }, kv: holder });
  await mirror.drain(source(store)); // cursor = 5
  seed(store, 1001, 10, 'u'); // stages 6..1006
  const calls = [];
  const skipping = new BoardMirror(
    { url: 'u', secret: 's' },
    holder,
    async (...args) => {
      calls.push(args);
      return {
        ok: true,
        status: 200,
        json: async () => ({ processedThrough: 0 }),
      };
    },
    () => 2_000_000
  );
  const out = await skipping.drain(source(store));
  assert.equal(out.posted, 0);
  assert.deepEqual(calls, []); // skipped without a POST
  assert.equal(await holder.get(MIRROR_KEYS.cursor), 1006);
  const status = await mirror.status(source(store));
  assert.equal(status.skipped, 1001);
  assert.equal(status.cursor, 1006);
  assert.equal(status.backlog, 0);
});

test('backoffAt fires only when enabled with a backlog', async () => {
  const store = makeStore();
  seed(store, 2);
  const holder = kv();
  const off = new BoardMirror({}, holder, async () => {
    throw new Error('never');
  });
  assert.equal(await off.backoffAt(source(store)), null);
  const on = new BoardMirror({ url: 'u', secret: 's' }, holder, async () => {
    throw new Error('never');
  });
  await on.drain(source(store)); // arm cursor at max
  assert.equal(await on.backoffAt(source(store)), null);
  seed(store, 1, 50, 'v');
  const due = await on.backoffAt(source(store));
  assert.ok(due && due > 0);
});

test('signature is HMAC-SHA256 over `${timestamp}.${rawBody}`, hex, sent in the x-mesh headers', async () => {
  const store = makeStore();
  seed(store, 1);
  const holder = kv();
  const seen = [];
  const { mirror } = makeMirror({
    env: { url: 'https://receiver.example', secret: 'shh' },
    kv: holder,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ processedThrough: 2 }),
      };
    },
    now: () => 1_700_000_000_000,
  });
  await mirror.drain(source(store)); // arms the cursor, no POST
  seed(store, 1, 50, 'u');
  await mirror.drain(source(store));
  assert.equal(seen.length, 1);
  const { init } = seen[0];
  const raw = init.body;
  const expected = await mirrorSignature('shh', '1700000000000', raw);
  assert.equal(init.headers['x-mesh-timestamp'], '1700000000000');
  assert.equal(init.headers['x-mesh-signature'], expected);
  assert.match(expected, /^[a-f0-9]{64}$/);
  // Independent recomputation of the documented scheme.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('shh'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`1700000000000.${raw}`)
  );
  assert.equal(
    expected,
    [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  );
});

test('body mode: bodies, notes, results and answers ride along, truncated; off by default', () => {
  const row = {
    stageId: 7,
    taskId: 't',
    at: 1,
    actor: 'claude',
    stage: 'progress',
    note: 'n'.repeat(600),
    type: 'task',
    title: 'title',
    poster: 'summer',
    assignee: null,
    caps: ['research'],
    parent: null,
    status: 'claimed',
    result: 'r'.repeat(600),
    body: 'b'.repeat(3000),
    answers: [{ from: 'aeon', at: 2, text: 'a'.repeat(600) }],
  };
  const quiet = serializeRow(row, false);
  assert.equal(quiet.stage, 'progress');
  assert.equal(quiet.actor, 'claude');
  assert.equal('body' in quiet, false);
  assert.equal('result' in quiet, false);
  assert.equal('note' in quiet, false);
  assert.equal('answers' in quiet, false);
  const rich = serializeRow(row, true);
  assert.equal(rich.body.length, MIRROR.bodyChars);
  assert.equal(rich.note.length, MIRROR.tailChars);
  assert.equal(rich.result.length, MIRROR.tailChars);
  assert.equal(rich.answers[0].text.length, MIRROR.tailChars);
});

test('a drain that throws never escapes: callers stay unaffected', async () => {
  const store = makeStore();
  seed(store, 2);
  const holder = kv();
  const mirror = new BoardMirror(
    { url: 'u', secret: 's' },
    holder,
    async () => {
      throw new Error('fetch boom');
    }
  );
  await mirror.drain(source(store)); // arms the cursor
  seed(store, 1, 50, 'v');
  // drain resolves (reports failure) rather than rejecting.
  const out = await mirror.drain(source(store));
  assert.equal(out.failed, true);
  // And a waitUntil-style wrapper stays quiet.
  let captured;
  const waitUntil = promise => {
    captured = promise;
  };
  mirror.enabled &&
    waitUntil(mirror.drain(source(store)).catch(() => undefined));
  await captured;
});
