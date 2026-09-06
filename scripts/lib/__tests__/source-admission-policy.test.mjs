import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  evaluateSourceAdmission,
  runSourceAdmission,
} from '../source-admission-policy.mjs';

const head = 'a'.repeat(40);
const other = 'b'.repeat(40);
const repository = 'JovieInc/Jovie';
function fixture() {
  return {
    repository,
    expectedHead: head,
    complete: true,
    pr: {
      number: 7,
      state: 'open',
      draft: false,
      labels: [],
      head: { sha: head, ref: 'codex/repair', repo: { fork: false } },
      base: { ref: 'main' },
      changed_files: 1,
      mergeable: true,
    },
    files: [{ filename: 'scripts/fix.mjs' }],
    reviews: [],
    statuses: [],
  };
}
function review(state, id = 1, extra = {}) {
  return {
    id,
    state,
    submitted_at: `2026-09-05T00:00:0${id}Z`,
    commit_id: head,
    user: { login: 'reviewer', type: 'User' },
    author_association: 'MEMBER',
    ...extra,
  };
}
function tombstone(context = 'jovie-queue-product-failure/v1') {
  return {
    context,
    state: 'success',
    description: context.includes('product')
      ? 'blocked:merge-group-product-failure'
      : 'ejected:UNMERGEABLE',
    creator: { login: 'jovie-bot[bot]', type: 'Bot' },
    target_url: `https://github.com/${repository}/actions/runs/123`,
  };
}
test('qualified source remains eligible with unavailable Symphony, unbound production and unrelated failures', () => {
  const input = fixture();
  input.statuses = [
    'symphony-health',
    'production-binding',
    'optional-test',
  ].map(context => ({ context, state: 'failure' }));
  assert.equal(evaluateSourceAdmission(input).allowed, true);
});
test('every mechanical hold blocks and removing it restores eligibility', () => {
  for (const name of [
    'hold',
    'gated',
    'incident',
    'queue-deferred',
    'needs-conflict-resolution',
    'fast',
  ]) {
    const input = fixture();
    input.pr.labels = [{ name }];
    assert.deepEqual(evaluateSourceAdmission(input).blockers, [`hold:${name}`]);
    input.pr.labels = [];
    assert.equal(evaluateSourceAdmission(input).allowed, true);
  }
});
test('draft closed conflicting wrong-base and stale heads block', () => {
  for (const [mutate, reason] of [
    [
      pr => {
        pr.draft = true;
      },
      'draft',
    ],
    [
      pr => {
        pr.state = 'closed';
      },
      'closed',
    ],
    [
      pr => {
        pr.mergeable = false;
      },
      'conflict',
    ],
    [
      pr => {
        pr.base.ref = 'development';
      },
      'wrong-base',
    ],
    [
      pr => {
        pr.head.sha = other;
      },
      'stale-head',
    ],
  ]) {
    const input = fixture();
    mutate(input.pr);
    assert.ok(evaluateSourceAdmission(input).blockers.includes(reason));
  }
});
test('missing and incomplete evidence fails closed', () => {
  for (const key of [
    'pr',
    'files',
    'reviews',
    'statuses',
    'complete',
    'expectedHead',
    'repository',
  ]) {
    const input = fixture();
    delete input[key];
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
  const input = fixture();
  input.pr.changed_files = 2;
  assert.equal(evaluateSourceAdmission(input).allowed, false);
});
test('latest opinionated reviewer state controls current-head change requests', () => {
  const input = fixture();
  input.reviews = [review('CHANGES_REQUESTED')];
  assert.deepEqual(evaluateSourceAdmission(input).blockers, [
    'changes-requested:reviewer',
  ]);
  input.reviews.push(review('COMMENTED', 2));
  assert.equal(evaluateSourceAdmission(input).allowed, false);
  input.reviews.push(review('APPROVED', 3));
  assert.equal(evaluateSourceAdmission(input).allowed, true);
  input.reviews = [review('CHANGES_REQUESTED', 1, { commit_id: other })];
  assert.equal(evaluateSourceAdmission(input).allowed, true);
  input.reviews = [review('CHANGES_REQUESTED', 1, { submitted_at: 'invalid' })];
  assert.equal(evaluateSourceAdmission(input).allowed, false);
});
test('fork approval must be current human collaborator latest opinionated state', () => {
  const input = fixture();
  input.pr.head.repo.fork = true;
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes('fork-approval-required')
  );
  input.reviews = [review('APPROVED')];
  assert.equal(evaluateSourceAdmission(input).allowed, true);
  for (const extra of [
    { commit_id: other },
    { user: { login: 'bot', type: 'Bot' } },
    { author_association: 'NONE' },
  ]) {
    input.reviews = [review('APPROVED', 1, extra)];
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
  input.reviews = [review('APPROVED'), review('DISMISSED', 2)];
  assert.equal(evaluateSourceAdmission(input).allowed, false);
});
test('pre-land changelog collision preserves existing release branch exception', () => {
  const input = fixture();
  input.files = [{ filename: 'CHANGELOG.md' }];
  assert.ok(
    evaluateSourceAdmission(input).blockers.includes('pre-land-changelog')
  );
});
test('both trusted exact-head tombstones block even with later success; spoofed unrelated actors do not', () => {
  for (const context of [
    'jovie-queue-product-failure/v1',
    'jovie-native-unmergeable/v1',
  ]) {
    const input = fixture();
    input.statuses = [
      tombstone(context),
      { context: 'optional', state: 'success' },
    ];
    assert.ok(
      evaluateSourceAdmission(input).blockers.includes(`tombstone:${context}`)
    );
    input.statuses[0].creator = { type: 'User', login: 'attacker' };
    assert.equal(evaluateSourceAdmission(input).allowed, true);
    input.statuses[0].creator = null;
    assert.equal(evaluateSourceAdmission(input).allowed, false);
    input.statuses = [tombstone(context)];
    input.statuses[0].target_url =
      'https://github.com/other/repo/actions/runs/123';
    assert.equal(evaluateSourceAdmission(input).allowed, false);
  }
});
function requester(input, change = () => {}) {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    const data = path.includes('/files?')
      ? input.files
      : path.includes('/reviews?')
        ? input.reviews
        : path.includes('/statuses?')
          ? input.statuses
          : input.pr;
    const response = { data: structuredClone(data), link: null };
    change(path, response, calls);
    return response;
  };
  return { calls, request };
}
const args = {
  repository,
  prNumber: 7,
  expectedHead: head,
  token: 'test-token',
  deadlineMs: 12345,
};
test('runtime fetch pins status endpoint, preserves deadline and rechecks metadata after pages', async () => {
  const mock = requester(fixture());
  const result = await runSourceAdmission({ ...args, request: mock.request });
  assert.equal(result.allowed, true);
  assert.equal(mock.calls.length, 5);
  assert.ok(
    mock.calls.some(call => call.path.includes(`/commits/${head}/statuses`))
  );
  assert.ok(mock.calls.every(call => call.options.deadlineMs === 12345));
  assert.equal(mock.calls.at(-1).path, '/repos/JovieInc/Jovie/pulls/7');
});
test('late hold blocks and concurrent push cannot inherit earlier evidence', async () => {
  for (const mutate of [
    pr => {
      pr.labels = [{ name: 'hold' }];
    },
    pr => {
      pr.head.sha = other;
    },
  ]) {
    const mock = requester(fixture(), (path, response, calls) => {
      if (calls.length === 5) mutate(response.data);
    });
    if (mutate.toString().includes('head.sha'))
      await assert.rejects(
        runSourceAdmission({ ...args, request: mock.request }),
        /head changed/
      );
    else
      assert.equal(
        (await runSourceAdmission({ ...args, request: mock.request })).allowed,
        false
      );
  }
});
test('pagination includes later-page review and fails closed on cap or malformed evidence', async () => {
  const mock = requester(fixture(), (path, response) => {
    if (path.includes('/reviews?')) {
      if (path.endsWith('page=1')) response.link = '<next>; rel="next"';
      else response.data = [review('CHANGES_REQUESTED')];
    }
  });
  assert.equal(
    (await runSourceAdmission({ ...args, request: mock.request })).allowed,
    false
  );
  for (const alteration of [
    response => {
      response.link = '<next>; rel="next"';
    },
    response => {
      response.data = {};
    },
  ]) {
    const broken = requester(fixture(), (path, response) => {
      if (path.includes('/statuses?')) alteration(response);
    });
    await assert.rejects(
      runSourceAdmission({ ...args, request: broken.request }),
      /pagination|paginated/
    );
  }
});
test('missing token, HTTP failure and partial file response are never approval', async () => {
  await assert.rejects(runSourceAdmission({ ...args, token: '' }), /required/);
  await assert.rejects(
    runSourceAdmission({
      ...args,
      request: async () => {
        throw new Error('HTTP 403');
      },
    }),
    /403/
  );
  const input = fixture();
  input.pr.changed_files = 2;
  const mock = requester(input);
  assert.equal(
    (await runSourceAdmission({ ...args, request: mock.request })).allowed,
    false
  );
});

test('CLI missing credentials emits an actionable fail-closed JSON receipt', () => {
  const child = spawnSync(
    process.execPath,
    [
      'scripts/lib/source-admission-policy.mjs',
      '--repo',
      repository,
      '--pr',
      '7',
      '--head',
      head,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' },
    }
  );
  assert.equal(child.status, 1);
  const receipt = JSON.parse(child.stdout);
  assert.equal(receipt.allowed, false);
  assert.deepEqual(receipt.blockers, ['evidence-unavailable']);
});
