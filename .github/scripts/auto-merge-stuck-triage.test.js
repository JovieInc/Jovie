const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COMMENT_MARKER,
  gh,
  isTransientGhError,
  buildCommentBody,
  buildIssueBody,
  diagnoseStuckPr,
  findMarkerComment,
  hasRevisionFailureHold,
  needsAutoMergeEnable,
  enableMissingAutoMerge,
} = require('./auto-merge-stuck-triage');

const basePr = {
  number: 42,
  headRefOid: 'a'.repeat(40),
  title: 'Test PR',
  url: 'https://github.com/o/r/pull/42',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  autoMergeRequest: {
    enabledAt: '2026-09-23T00:00:00Z',
    mergeMethod: 'SQUASH',
  },
  comments: { nodes: [] },
};

const run = (name, status, conclusion, url) => ({
  name,
  status,
  conclusion,
  html_url: url ? `https://ci/${name}` : null,
});

test('diagnose: conflicts surface as blocker', () => {
  const d = diagnoseStuckPr(
    { ...basePr, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' },
    []
  );
  assert.ok(d.reasons.some(r => r.includes('merge conflicts')));
});

test('diagnose: failing checks are named with links', () => {
  const d = diagnoseStuckPr(basePr, [
    run('unit', 'completed', 'failure', true),
    run('lint', 'completed', 'success', true),
  ]);
  assert.ok(
    d.reasons.some(r => r.includes('failing checks') && r.includes('unit'))
  );
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
  const body = buildCommentBody(
    basePr,
    { reasons: ['reason-a', 'reason-b'] },
    6
  );
  assert.ok(body.includes(COMMENT_MARKER));
  assert.ok(body.includes('- reason-a'));
  assert.ok(body.includes('- reason-b'));
  assert.ok(body.includes('6h'));
});

test('findMarkerComment finds only marker comments', () => {
  const pr = {
    ...basePr,
    comments: {
      nodes: [
        { databaseId: 1, body: 'hello' },
        { databaseId: 2, body: `${COMMENT_MARKER}\nx` },
      ],
    },
  };
  assert.equal(findMarkerComment(pr)?.databaseId, 2);
});

test('needsAutoMergeEnable: only same-repo non-draft PRs without auto-merge', () => {
  const eligible = {
    ...basePr,
    autoMergeRequest: null,
    isDraft: false,
    isCrossRepository: false,
  };
  assert.equal(needsAutoMergeEnable(eligible), true);
  assert.equal(needsAutoMergeEnable({ ...eligible, isDraft: true }), false);
  assert.equal(
    needsAutoMergeEnable({ ...eligible, isCrossRepository: true }),
    false
  );
  assert.equal(needsAutoMergeEnable(basePr), false);
  for (const name of ['hold', 'Queue-Poison', 'do-not-merge']) {
    assert.equal(
      needsAutoMergeEnable({ ...eligible, labels: { nodes: [{ name }] } }),
      false,
      name
    );
  }
  assert.equal(
    needsAutoMergeEnable({
      ...eligible,
      labels: { nodes: [{ name: 'codex' }] },
    }),
    true
  );
  const revisionHold = {
    context: 'jovie-queue-failure-hold/v1',
    state: 'success',
    description: 'class=deterministic-source;n=1;run=123;try=1',
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
    target_url: 'https://github.com/o/r/actions/runs/123',
  };
  assert.equal(hasRevisionFailureHold([revisionHold], 'o/r'), true);
  assert.equal(needsAutoMergeEnable(eligible, [revisionHold], 'o/r'), false);
  assert.equal(
    hasRevisionFailureHold(
      [{ ...revisionHold, creator: { type: 'User', login: 'spoof' } }],
      'o/r'
    ),
    false
  );
});

test('issue body aggregates stuck PRs; empty state is explicit', () => {
  const stuckBody = buildIssueBody([
    { pr: basePr, diagnosis: { reasons: ['r'] } },
  ]);
  assert.ok(stuckBody.includes('#42'));
  assert.ok(buildIssueBody([]).includes('No stuck PRs'));
});

test('the customer-notes handoff requests auto-merge only for its checked head', () => {
  const calls = [];
  const pr = {
    ...basePr,
    autoMergeRequest: null,
    isDraft: false,
    customerNotesReadyHead: 'checked-sha',
  };
  const readStatuses = (repo, head) => {
    assert.equal(repo, 'o/r');
    assert.equal(head, pr.headRefOid);
    return [];
  };
  enableMissingAutoMerge(
    'o/r',
    [pr],
    false,
    args => calls.push(args),
    readStatuses
  );
  assert.deepEqual(calls[0].slice(-2), ['--match-head-commit', 'checked-sha']);
  const before = calls.length;
  enableMissingAutoMerge(
    'o/r',
    [pr],
    true,
    args => calls.push(args),
    readStatuses
  );
  enableMissingAutoMerge(
    'o/r',
    [{ ...pr, isDraft: true }],
    false,
    args => calls.push(args),
    readStatuses
  );
  assert.equal(calls.length, before);
});

test('enable pass skips missing heads and preserves an exact-head revision hold', () => {
  const pr = { ...basePr, autoMergeRequest: null, headRefOid: 'a'.repeat(40) };
  const calls = [];
  const reads = [];
  const readStatuses = (repo, head) => {
    reads.push([repo, head]);
    return [
      {
        context: 'jovie-queue-failure-hold/v1',
        state: 'success',
        creator: { type: 'Bot', login: 'jovie-bot[bot]' },
        target_url: 'https://github.com/o/r/actions/runs/123',
        description: 'class=deterministic-source;n=1;run=123;try=1',
      },
    ];
  };
  enableMissingAutoMerge(
    'o/r',
    [{ ...pr, headRefOid: undefined }, pr],
    false,
    args => calls.push(args),
    readStatuses
  );
  assert.deepEqual(reads, [['o/r', pr.headRefOid]]);
  assert.deepEqual(calls, []);
});

test('gh retries transient HTTP 5xx then succeeds', () => {
  let calls = 0;
  const exec = () => {
    calls += 1;
    if (calls < 3) {
      const err = new Error('Command failed: gh api graphql');
      err.stderr = 'gh: HTTP 502\n';
      err.stdout = '<html>502 Bad Gateway</html>';
      throw err;
    }
    return '{"ok":true}';
  };
  const out = gh(['api', 'graphql'], { exec, sleep: () => {} });
  assert.equal(out, '{"ok":true}');
  assert.equal(calls, 3);
});

test('gh does not retry non-transient failures', () => {
  let calls = 0;
  const exec = () => {
    calls += 1;
    const err = new Error('Command failed: gh api repos/o/r');
    err.stderr = 'gh: HTTP 404: Not Found\n';
    throw err;
  };
  assert.throws(() => gh(['api', 'repos/o/r'], { exec, sleep: () => {} }));
  assert.equal(calls, 1);
});

test('gh gives up after the attempt cap on persistent 5xx', () => {
  let calls = 0;
  const exec = () => {
    calls += 1;
    const err = new Error('Command failed: gh api graphql');
    err.stderr = 'gh: HTTP 503\n';
    throw err;
  };
  assert.throws(() => gh(['api', 'graphql'], { exec, sleep: () => {} }));
  assert.equal(calls, 4);
});

test('isTransientGhError only matches transient shapes', () => {
  const mk = (stderr, stdout = '') =>
    Object.assign(new Error('fail'), { stderr, stdout });
  assert.equal(isTransientGhError(mk('gh: HTTP 502\n')), true);
  assert.equal(isTransientGhError(mk('gh: HTTP 500\n')), true);
  assert.equal(isTransientGhError(mk('connection reset by peer\n')), true);
  assert.equal(isTransientGhError(mk('gh: HTTP 404: Not Found\n')), false);
  assert.equal(
    isTransientGhError(mk('gh: HTTP 401: Bad credentials\n')),
    false
  );
});
