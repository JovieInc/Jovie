import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD, BoardStore, parseBoardSend, taskIdFromRef } from './board.ts';
import { sqlite } from './core.test.mjs';

const ACTIVE = ['summer', 'claude', 'codex', 'aeon', 'grokbot'];

function board() {
  const store = new BoardStore(sqlite());
  store.setCaps('claude', ['code', 'research'], 0);
  store.setCaps('aeon', ['research'], 0);
  store.setCaps('grokbot', ['research', 'browser'], 0);
  return store;
}
const notices = store => store.pendingNotices(200);

test('post routes a task to every agent whose caps cover it, never the poster', () => {
  const store = board();
  store.post(
    'summer',
    { id: 'fc-1', title: 'Fact-check', caps: ['research'] },
    ACTIVE,
    1
  );
  assert.deepEqual(
    notices(store)
      .map(n => n.to)
      .sort(),
    ['aeon', 'claude', 'grokbot']
  );
  const body = JSON.parse(notices(store)[0].body);
  assert.equal(body.schema, 'jovie.board/v1');
  assert.equal(body.event, 'task.open');
  assert.equal(
    taskIdFromRef(`board:${notices(store)[0].correlationId}`),
    'fc-1'
  );
});

test('uncovered caps fall back to summer; assignee wins over caps', () => {
  const store = board();
  store.post(
    'claude',
    { id: 'd-1', title: 'Design', caps: ['design'] },
    ACTIVE,
    1
  );
  store.post(
    'claude',
    { id: 'd-2', title: 'Direct', caps: ['design'], to: 'codex' },
    ACTIVE,
    1
  );
  const to = notices(store)
    .map(n => `${n.correlationId.split(':')[1]}>${n.to}`)
    .sort();
  assert.deepEqual(to, ['d-1>summer', 'd-2>codex']);
});

test('claim is a lease: one winner, expiry returns it to the pool and re-notifies', () => {
  const store = board();
  store.post(
    'summer',
    { id: 'l-1', title: 'Work', caps: ['research'], leaseSec: 60 },
    ACTIVE,
    0
  );
  const first = store.claim('aeon', { id: 'l-1' }, 10);
  assert.equal(first.claimed, true);
  assert.equal(store.claim('grokbot', { id: 'l-1' }, 11).claimed, false);
  assert.throws(
    () => store.update('grokbot', { id: 'l-1' }, 12),
    /not_claimant/
  );
  store.update('aeon', { id: 'l-1', note: 'halfway' }, 30_000);
  assert.equal(store.get('l-1').leaseUntil, 90_000);
  assert.equal(store.nextLeaseDue(), 90_000);
  assert.deepEqual(store.sweep(ACTIVE, 89_999).expired, []);
  for (const n of notices(store)) store.markSent(n.correlationId, n.to, 1);
  assert.deepEqual(store.sweep(ACTIVE, 90_000).expired, ['l-1']);
  const task = store.get('l-1');
  assert.equal(task.status, 'open');
  assert.equal(task.claimant, null);
  const reopened = notices(store).map(n => JSON.parse(n.body));
  assert.ok(
    reopened.every(
      n => n.event === 'task.reopened' && n.previousClaimant === 'aeon'
    )
  );
  assert.equal(store.claim('grokbot', {}, 100_000).task.id, 'l-1');
  assert.equal(store.get('l-1').attempts, 2);
  assert.equal(store.get('l-1').firstClaimedAt, 10);
});

test('claim without id takes the oldest open task the agent can do', () => {
  const store = board();
  store.post(
    'summer',
    { id: 'a', title: 'browser one', caps: ['browser'] },
    ACTIVE,
    1
  );
  store.post(
    'summer',
    { id: 'b', title: 'research one', caps: ['research'] },
    ACTIVE,
    2
  );
  assert.equal(store.claim('aeon', {}, 3).task.id, 'b');
  assert.equal(store.claim('aeon', {}, 4).claimed, false);
  assert.equal(store.claim('grokbot', {}, 5).task.id, 'a');
});

test('fan-out: children, then one merge task with every result, then the parent closes', () => {
  const store = board();
  const out = store.post(
    'summer',
    {
      id: 'deck',
      title: 'Fact-check deck',
      caps: ['research'],
      fanout: [
        { title: 's1' },
        { title: 's2', to: 'grokbot' },
        { title: 's3' },
      ],
      merge: { body: 'Merge into one verdict table' },
    },
    ACTIVE,
    0
  );
  assert.deepEqual(out.children, ['deck.1', 'deck.2', 'deck.3']);
  assert.equal(store.get('deck').status, 'waiting');
  assert.throws(
    () => store.done('claude', { id: 'deck', result: 'x' }, ACTIVE, 1),
    /waiting_on_children/
  );
  store.claim('claude', { id: 'deck.1' }, 10);
  store.done('claude', { id: 'deck.1', result: 'r1' }, ACTIVE, 20);
  assert.throws(
    () => store.claim('aeon', { id: 'deck.2' }, 21),
    /assigned_elsewhere/
  );
  store.done('grokbot', { id: 'deck.2', result: 'r2' }, ACTIVE, 30); // implicit claim
  assert.equal(store.get('deck.merge'), null);
  store.claim('aeon', { id: 'deck.3' }, 31);
  store.done(
    'aeon',
    { id: 'deck.3', result: 'r3', status: 'failed' },
    ACTIVE,
    40
  );
  const merge = store.get('deck.merge');
  assert.equal(merge.type, 'merge');
  assert.equal(merge.assignee, 'summer');
  assert.match(
    merge.body,
    /Merge into one verdict table[\s\S]*deck.1 \(done by claude\)[\s\S]*r1[\s\S]*deck.3 \(failed by aeon\)/
  );
  store.done('summer', { id: 'deck.merge', result: 'final' }, ACTIVE, 50);
  const parent = store.get('deck');
  assert.equal(parent.status, 'done');
  assert.equal(parent.result, 'final');
  const m = store.metrics(3_600_000, 60);
  assert.equal(m.agents.claude.done, 1);
  assert.equal(m.agents.summer.done, 1); // the merge only, not the parent
  assert.equal(m.agents.claude.workMs.p50, 10);
  assert.equal(m.agents.claude.pickupMs.p50, 10);
  assert.equal(m.agents.aeon.failed, 1);
  assert.equal(m.agents.grokbot.workMs.p50, 0);
  assert.ok(
    store
      .stages('deck.2')
      .some(s => s.stage === 'claimed' && s.note === 'implicit')
  );
});

test('questions take answers from anyone and notify the poster; only the poster closes', () => {
  const store = board();
  store.post(
    'codex',
    { id: 'q-1', type: 'question', title: 'Which Neon branch?' },
    ACTIVE,
    1
  );
  assert.throws(
    () => store.claim('claude', { id: 'q-1' }, 2),
    /questions_are_answered/
  );
  store.answer('claude', { id: 'q-1', answer: 'main' }, 3);
  store.answer('aeon', { id: 'q-1', answer: 'staging' }, 4);
  const toPoster = notices(store)
    .filter(n => n.to === 'codex')
    .map(n => JSON.parse(n.body));
  assert.deepEqual(
    toPoster.map(n => n.answer.text),
    ['main', 'staging']
  );
  assert.throws(
    () => store.done('claude', { id: 'q-1', result: 'x' }, ACTIVE, 5),
    /only_poster/
  );
  store.done('codex', { id: 'q-1', result: 'main' }, ACTIVE, 6);
  assert.throws(
    () => store.answer('aeon', { id: 'q-1', answer: 'late' }, 7),
    /not_an_open_question/
  );
});

test('post is idempotent per poster; cancel closes children; validation rejects junk', () => {
  const store = board();
  store.post(
    'summer',
    { id: 'p', title: 't', fanout: [{ title: 'c' }] },
    ACTIVE,
    1
  );
  assert.equal(
    store.post('summer', { id: 'p', title: 't' }, ACTIVE, 2).replay,
    true
  );
  assert.throws(
    () => store.post('claude', { id: 'p', title: 't' }, ACTIVE, 2),
    /task_exists/
  );
  store.cancel('summer', { id: 'p' }, 3);
  assert.equal(store.get('p.1').status, 'cancelled');
  assert.throws(() => store.cancel('claude', { id: 'p' }, 3), /only_poster/);
  assert.throws(
    () => store.post('summer', { id: 'BAD ID', title: 't' }, ACTIVE, 1),
    /invalid_id/
  );
  assert.throws(
    () => store.post('summer', { title: '' }, ACTIVE, 1),
    /invalid_title/
  );
  assert.throws(
    () => store.post('summer', { title: 't', caps: ['Has Space'] }, ACTIVE, 1),
    /invalid_caps/
  );
  assert.throws(
    () => store.post('summer', { title: 't', fanout: [] }, ACTIVE, 1),
    /invalid_fanout/
  );
  assert.throws(
    () => store.apply('summer', 'nope', {}, ACTIVE, 1),
    /invalid_op/
  );
  assert.throws(
    () => store.claim('aeon', { id: 'missing' }, 1),
    /task_not_found/
  );
  const leased = store.post(
    'summer',
    { id: 'big', title: 't', leaseSec: 10 ** 9 },
    ACTIVE,
    1
  );
  assert.equal(leased.task.leaseMs, BOARD.maxLeaseMs);
});

test('done replays for the same result; a closed task rejects a different one', () => {
  const store = board();
  store.post('summer', { id: 'r', title: 't' }, ACTIVE, 1);
  store.claim('claude', { id: 'r' }, 2);
  store.done('claude', { id: 'r', result: 'ok' }, ACTIVE, 3);
  assert.equal(
    store.done('claude', { id: 'r', result: 'ok' }, ACTIVE, 4).replay,
    true
  );
  assert.throws(
    () => store.done('claude', { id: 'r', result: 'other' }, ACTIVE, 4),
    /task_closed/
  );
  const toPoster = notices(store)
    .filter(n => n.to === 'summer')
    .map(n => JSON.parse(n.body).event);
  assert.deepEqual(toPoster, ['task.done']);
});

test('mesh sends: JSON op, or a plain reply to a notice becomes done/answer', () => {
  const store = board();
  store.post('summer', { id: 'm', title: 't' }, ACTIVE, 1);
  store.post('summer', { id: 'mq', type: 'question', title: 'q' }, ACTIVE, 1);
  const lookup = id => store.get(id);
  assert.deepEqual(parseBoardSend('{"op":"claim","id":"m"}', null, lookup), {
    op: 'claim',
    input: { op: 'claim', id: 'm' },
  });
  assert.deepEqual(
    parseBoardSend('All 3 claims verified.', 'board:t:m:4', lookup),
    {
      op: 'done',
      input: { id: 'm', result: 'All 3 claims verified.' },
    }
  );
  // Summer's reply form: `${to}:${correlationId}`.
  assert.equal(parseBoardSend('yes', 'board:t:mq:7', lookup).op, 'answer');
  assert.throws(
    () => parseBoardSend('hello', null, lookup),
    /board_needs_op_or_reply/
  );
  assert.throws(
    () => parseBoardSend('{not json', 'x', lookup),
    /board_needs_op_or_reply/
  );
});
