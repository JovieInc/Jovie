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

test('mesh sends: JSON op, or a plain reply to a notice becomes note/answer', () => {
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
      op: 'note',
      input: { id: 'm', note: 'All 3 claims verified.' },
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

test('reassign: poster or orchestrator moves an open task and only the new assignee hears', () => {
  const store = board();
  store.post(
    'codex',
    { id: 'ra-1', title: 'Check', caps: ['research'] },
    ACTIVE,
    1
  );
  for (const n of notices(store)) store.markSent(n.correlationId, n.to, 1);
  const out = store.reassign('summer', { id: 'ra-1', to: 'grokbot' }, 5);
  assert.equal(out.task.assignee, 'grokbot');
  const fresh = notices(store);
  assert.deepEqual(
    fresh.map(n => n.to),
    ['grokbot']
  );
  const body = JSON.parse(fresh[0].body);
  assert.equal(body.event, 'task.open');
  assert.deepEqual(body.reassigned, {
    from: null,
    to: 'grokbot',
    by: 'summer',
  });
  const stage = store.stages('ra-1').find(s => s.stage === 'reassigned');
  assert.equal(stage.actor, 'summer');
  assert.equal(stage.note, 'from=pool to=grokbot');
  // The poster may reassign its own task; a repeat is a replay with no new notice.
  store.reassign('codex', { id: 'ra-1', to: 'aeon' }, 6);
  assert.equal(store.get('ra-1').assignee, 'aeon');
  const before = notices(store).length;
  assert.equal(
    store.apply('codex', 'reassign', { id: 'ra-1', to: 'aeon' }, ACTIVE, 7)
      .replay,
    true
  );
  assert.equal(notices(store).length, before);
  // A new claim goes to the assignee only.
  assert.throws(
    () => store.claim('claude', { id: 'ra-1' }, 8),
    /assigned_elsewhere/
  );
});

test('reassign refuses non-poster non-orchestrators, claimed tasks and bad targets', () => {
  const store = board();
  store.post(
    'codex',
    { id: 'ra-2', title: 'Check', caps: ['research'] },
    ACTIVE,
    1
  );
  assert.throws(
    () => store.reassign('aeon', { id: 'ra-2', to: 'grokbot' }, 2),
    /only_poster_or_orchestrator_reassigns/
  );
  assert.throws(
    () => store.reassign('summer', { id: 'ra-2', to: 'Not A Kind' }, 2),
    /invalid_to/
  );
  assert.throws(
    () => store.reassign('summer', { id: 'ra-2', to: 'board' }, 2),
    /invalid_to/
  );
  assert.throws(
    () => store.reassign('summer', { id: 'ra-2' }, 2),
    /invalid_to/
  );
  store.claim('aeon', { id: 'ra-2' }, 3);
  assert.throws(
    () => store.reassign('summer', { id: 'ra-2', to: 'grokbot' }, 4),
    /task_not_open/
  );
  assert.throws(
    () => store.reassign('claude', { id: 'missing', to: 'grokbot' }, 4),
    /task_not_found/
  );
  assert.equal(
    store.stages('ra-2').some(s => s.stage === 'reassigned'),
    false
  );
});

// Exercise the same parse -> apply path used by Board.fromMesh, over real SQLite.
function meshReply(store, from, body, id, now = 10) {
  const parsed = parseBoardSend(body, `board:t:${id}:1`, id => store.get(id));
  return store.apply(from, parsed.op, parsed.input, ACTIVE, now);
}

for (const status of ['open', 'claimed']) {
  for (const reply of [
    'I cannot execute this task. I can only read and reply.',
    'ACK, received.',
    'The relevant file is workers/mesh-hub/src/board.ts.',
  ]) {
    test(`plaintext ${status} task reply is informational: ${reply}`, () => {
      const store = board();
      store.post(
        'codex',
        { id: 'info', title: 'Repair', to: 'summer' },
        ACTIVE,
        1
      );
      if (status === 'claimed') store.claim('summer', { id: 'info' }, 2);
      const before = store.get('info');
      const stages = store.stages('info');
      const pending = notices(store);
      const metrics = store.metrics(3_600_000, 10);
      const out = meshReply(store, 'summer', reply, 'info');
      assert.equal(out.recorded, true);
      assert.equal(out.claimed, undefined);
      assert.deepEqual(store.get('info'), before);
      assert.deepEqual(notices(store), pending);
      assert.deepEqual(store.metrics(3_600_000, 10), metrics);
      assert.deepEqual(store.stages('info'), [
        ...stages,
        {
          at: new Date(10).toISOString(),
          actor: 'summer',
          stage: 'note',
          note: reply,
        },
      ]);
      assert.equal(meshReply(store, 'summer', reply, 'info', 11).replay, true);
      assert.equal(store.stages('info').length, stages.length + 1);
      assert.deepEqual(store.get('info'), before);
    });
  }
}

test('informational replies preserve assignee and claimant bounds without orchestrator override', () => {
  const store = board();
  store.post('codex', { id: 'bound', title: 'Repair', to: 'aeon' }, ACTIVE, 1);
  assert.throws(
    () => meshReply(store, 'summer', 'ACK', 'bound'),
    /assigned_elsewhere/
  );
  store.post('codex', { id: 'pool', title: 'Repair' }, ACTIVE, 1);
  store.claim('aeon', { id: 'pool' }, 2);
  const before = store.get('pool');
  for (const from of ['codex', 'summer', 'claude', 'grokbot']) {
    assert.throws(() => meshReply(store, from, 'ACK', 'pool'), /not_claimant/);
  }
  assert.deepEqual(store.get('pool'), before);
  assert.equal(
    store.stages('pool').some(s => s.stage === 'note'),
    false
  );
});

test('child and merge replies cannot release a merge or close a waiting parent', () => {
  const store = board();
  store.post(
    'codex',
    {
      id: 'parent',
      title: 'Repair',
      fanout: [{ title: 'child', to: 'summer' }],
    },
    ACTIVE,
    1
  );
  meshReply(store, 'summer', 'Cannot execute.', 'parent.1');
  assert.equal(store.get('parent.1').status, 'open');
  assert.equal(store.get('parent').status, 'waiting');
  assert.equal(store.get('parent.merge'), null);
  assert.throws(
    () => meshReply(store, 'codex', 'ACK', 'parent'),
    /waiting_on_children/
  );
  meshReply(
    store,
    'summer',
    '{"op":"done","id":"parent.1","result":"child evidence"}',
    'parent.1',
    11
  );
  const merge = store.get('parent.merge');
  meshReply(store, 'codex', 'ACK', 'parent.merge', 12);
  assert.deepEqual(store.get('parent.merge'), merge);
  assert.equal(store.get('parent').status, 'waiting');
  meshReply(
    store,
    'codex',
    '{"op":"done","id":"parent.merge","result":"merged evidence"}',
    'parent.merge',
    13
  );
  assert.equal(store.get('parent').status, 'done');
});

test('notes are bounded, validated and cannot append to closed tasks or questions', () => {
  const store = board();
  store.post('codex', { id: 'note-bound', title: 'Repair' }, ACTIVE, 1);
  const before = store.get('note-bound');
  meshReply(store, 'summer', 'x'.repeat(BOARD.maxText), 'note-bound');
  assert.equal(store.stages('note-bound').at(-1).note, 'x'.repeat(500));
  for (const note of ['', 42, null, 'x'.repeat(BOARD.maxText + 1)]) {
    assert.throws(
      () =>
        store.apply('summer', 'note', { id: 'note-bound', note }, ACTIVE, 11),
      /invalid_note/
    );
  }
  assert.throws(
    () =>
      store.apply('summer', 'note', { id: 'missing', note: 'ACK' }, ACTIVE, 11),
    /task_not_found/
  );
  assert.deepEqual(store.get('note-bound'), before);
  store.done('summer', { id: 'note-bound', result: 'evidence' }, ACTIVE, 12);
  assert.throws(
    () => meshReply(store, 'summer', 'ACK', 'note-bound', 13),
    /task_closed/
  );
  store.post(
    'codex',
    { id: 'note-q', type: 'question', title: 'Why?' },
    ACTIVE,
    1
  );
  assert.throws(
    () =>
      store.apply('summer', 'note', { id: 'note-q', note: 'ACK' }, ACTIVE, 11),
    /questions_are_answered/
  );
});

test('explicit structured done keeps validation, ownership, implicit claim and replay semantics', () => {
  const store = board();
  store.post(
    'codex',
    { id: 'explicit', title: 'Repair', to: 'summer' },
    ACTIVE,
    1
  );
  const done = '{"op":"done","id":"explicit","result":"verified evidence"}';
  assert.throws(
    () =>
      meshReply(store, 'summer', '{"op":"done","id":"explicit"}', 'explicit'),
    /invalid_result/
  );
  assert.throws(
    () => meshReply(store, 'aeon', done, 'explicit'),
    /assigned_elsewhere/
  );
  assert.equal(store.get('explicit').status, 'open');
  const out = meshReply(store, 'summer', done, 'explicit');
  assert.equal(out.task.status, 'done');
  assert.equal(out.task.claimant, 'summer');
  assert.equal(out.task.attempts, 1);
  assert.equal(meshReply(store, 'summer', done, 'explicit', 11).replay, true);
  assert.throws(
    () => meshReply(store, 'aeon', done, 'explicit', 12),
    /task_closed/
  );
  assert.equal(
    store.stages('explicit').filter(s => s.stage === 'done').length,
    1
  );
  store.post('codex', { id: 'claimed-explicit', title: 'Repair' }, ACTIVE, 1);
  store.claim('summer', { id: 'claimed-explicit' }, 2);
  const failed =
    '{"op":"done","id":"claimed-explicit","status":"failed","result":"verified failure"}';
  assert.throws(
    () => meshReply(store, 'aeon', failed, 'claimed-explicit'),
    /not_claimant/
  );
  assert.equal(
    meshReply(store, 'summer', failed, 'claimed-explicit').task.status,
    'failed'
  );
});

test('plaintext question replies still answer without claiming or completing', () => {
  const store = board();
  store.post(
    'codex',
    { id: 'reply-q', type: 'question', title: 'Which branch?' },
    ACTIVE,
    1
  );
  meshReply(store, 'summer', 'main', 'reply-q');
  const task = store.get('reply-q');
  assert.deepEqual(task.answers, [{ from: 'summer', at: 10, text: 'main' }]);
  assert.equal(task.status, 'open');
  assert.equal(task.claimant, null);
  assert.equal(task.doneAt, null);
  assert.equal(
    JSON.parse(notices(store).find(n => n.to === 'codex').body).event,
    'question.answered'
  );
});
