const test = require('node:test');
const assert = require('node:assert/strict');
const { finishCustomerNotes } = require('./customer-notes-ready');
const checks = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
].map(name => ({ name, bucket: 'pass' }));
const source = () => ({
  number: 42,
  isDraft: true,
  isCrossRepository: false,
  baseRefName: 'main',
  headRefName: 'release/daily-changelog-2026-10-02-12-1',
  headRefOid: 'abc',
  files: { totalCount: 1, nodes: [{ path: 'CHANGELOG.md' }] },
});
function execute(
  pr,
  { required = checks, head = 'abc', dry = false, failure = false } = {}
) {
  const calls = [];
  finishCustomerNotes('o/r', [pr], dry, args => {
    calls.push(args);
    if (args[1] === 'checks') {
      if (failure) throw new Error('pending');
      return JSON.stringify(required);
    }
    return JSON.stringify({ headRefOid: head });
  });
  return calls;
}
test('only the dedicated same-repo changelog-only draft can advance', () => {
  const pr = source();
  assert.equal(execute(pr).at(-1)[1], 'ready');
  assert.equal(pr.isDraft, false);
  for (const change of [
    { isDraft: false },
    { isCrossRepository: true },
    { baseRefName: 'other' },
    { headRefName: 'codex/notes' },
    { files: undefined },
    { files: { totalCount: 2, nodes: [{ path: 'CHANGELOG.md' }] } },
    { files: { totalCount: 1, nodes: [{ path: 'app.js' }] } },
    { labels: { nodes: [{ name: 'Hold' }] } },
  ])
    assert.equal(execute({ ...source(), ...change }).length, 0);
  assert.equal(
    execute({
      ...source(),
      headRefName: 'release/daily-changelog-2026-10-02',
      labels: { nodes: [{ name: 'codex' }] },
    }).at(-1)[1],
    'ready'
  );
});
test('missing, failing and pending checks, advanced heads and dry runs retain the draft', () => {
  for (const options of [
    { required: [] },
    { required: checks.slice(1) },
    { required: [...checks, { name: 'extra', bucket: 'fail' }] },
    { failure: true },
    { head: 'advanced' },
    { dry: true },
  ]) {
    const pr = source();
    assert.ok(execute(pr, options).every(args => args[1] !== 'ready'));
    assert.equal(pr.isDraft, true);
  }
});

test('one failed view or ready action leaves the next note and normal triage available', () => {
  for (const operation of ['view', 'ready']) {
    const first = source(),
      second = { ...source(), number: 43 };
    const calls = [];
    finishCustomerNotes('o/r', [first, second], false, args => {
      calls.push(args);
      if (args[1] === operation && args[2] === '42')
        throw new Error('head changed');
      return JSON.stringify(
        args[1] === 'checks' ? checks : { headRefOid: 'abc' }
      );
    });
    assert.equal(first.isDraft, true);
    assert.equal(second.isDraft, false);
    assert.equal(second.customerNotesReadyHead, 'abc');
    assert.ok(calls.some(args => args[1] === 'ready' && args[2] === '43'));
  }
});
