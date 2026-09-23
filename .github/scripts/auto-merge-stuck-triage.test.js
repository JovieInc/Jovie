const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COMMENT_MARKER,
  buildCommentBody,
  buildIssueBody,
  diagnoseStuckPr,
  findMarkerComment,
} = require('./auto-merge-stuck-triage');

const basePr = {
  number: 42,
  title: 'Test PR',
  url: 'https://github.com/o/r/pull/42',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  autoMergeRequest: { enabledAt: '2026-09-23T00:00:00Z', mergeMethod: 'SQUASH' },
  comments: { nodes: [] },
};

const run = (name, status, conclusion, url) => ({
  name,
  status,
  conclusion,
  html_url: url ? `https://ci/${name}` : null,
});

test('diagnose: conflicts surface as blocker', () => {
  const d = diagnoseStuckPr({ ...basePr, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }, []);
  assert.ok(d.reasons.some(r => r.includes('merge conflicts')));
});

test('diagnose: failing checks are named with links', () => {
  const d = diagnoseStuckPr(basePr, [
    run('unit', 'completed', 'failure', true),
    run('lint', 'completed', 'success', true),
  ]);
  assert.ok(d.reasons.some(r => r.includes('failing checks') && r.includes('unit')));
  assert.ok(!d.reasons.join(' ').includes('lint'));
});

test('diagnose: pending checks are surfaced', () => {
  const d = diagnoseStuckPr(basePr, [run('e2e', 'in_progress', null, true)]);
  assert.ok(d.reasons.some(r => r.includes('pending') && r.includes('e2e')));
});

test('diagnose: BLOCKED with no check evidence falls back to protection note', () => {
  const d = diagnoseStuckPr({ ...basePr, mergeStateStatus: 'BLOCKED' }, []);
  assert.ok(d.reasons.some(r => r.includes('branch protection')));
});

test('diagnose: clean-but-unmerged names mergeStateStatus', () => {
  const d = diagnoseStuckPr(basePr, []);
  assert.ok(d.reasons.some(r => r.includes('mergeStateStatus=CLEAN')));
});

test('comment body carries marker and exactly the reasons', () => {
  const body = buildCommentBody(basePr, { reasons: ['reason-a', 'reason-b'] }, 6);
  assert.ok(body.includes(COMMENT_MARKER));
  assert.ok(body.includes('- reason-a'));
  assert.ok(body.includes('- reason-b'));
  assert.ok(body.includes('6h'));
});

test('findMarkerComment finds only marker comments', () => {
  const pr = {
    ...basePr,
    comments: { nodes: [{ databaseId: 1, body: 'hello' }, { databaseId: 2, body: `${COMMENT_MARKER}\nx` }] },
  };
  assert.equal(findMarkerComment(pr)?.databaseId, 2);
});

test('issue body aggregates stuck PRs; empty state is explicit', () => {
  const stuckBody = buildIssueBody([{ pr: basePr, diagnosis: { reasons: ['r'] } }]);
  assert.ok(stuckBody.includes('#42'));
  assert.ok(buildIssueBody([]).includes('No stuck PRs'));
});
