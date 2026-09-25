import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decideLinearMergeClose,
  extractLinearRefs,
  mergeComment,
  syncLinearOnMerge,
} from './linear-merge-close.mjs';

const ISSUE_ID = '19ab500f-4702-4753-bfad-f96e8b02a504';

function issue(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: 'JOV-6586',
    title: 'Shipping Lead admission',
    labels: [],
    children: { complete: true, nodes: [] },
    ...overrides,
  };
}

function pullRequest(overrides = {}) {
  return {
    number: 18277,
    state: 'open',
    isDraft: false,
    title: 'feat(symphony): shipping runtime (JOV-6586)',
    body: `<!-- linear-issue-id:${ISSUE_ID} -->`,
    headRefName: 'codex/jov-6586-shipping-runtime',
    ...overrides,
  };
}

function decide(overrides = {}) {
  return decideLinearMergeClose({
    currentPrNumber: 18275,
    prBody: 'Layer 1 landed. No further gate in this pull request.',
    issue: issue(),
    linkedPullRequests: [],
    siblingLookupComplete: true,
    ...overrides,
  });
}

describe('linear merge close guard', () => {
  it('does not move to Done while a sibling linked PR is still open', () => {
    const decision = decide({
      linkedPullRequests: [pullRequest({ number: 18277, isDraft: false })],
    });
    assert.equal(decision.transition, false);
    assert.equal(decision.reason, 'open-or-draft-linked-pull-request');
    assert.match(decision.detail, /#18277/);
  });

  it('does not move to Done while the final stack layer is still draft', () => {
    const decision = decide({
      linkedPullRequests: [
        pullRequest({
          number: 18293,
          isDraft: true,
          state: 'open',
          title:
            'feat(symphony): capture native Shipping Lead worker evidence (JOV-6586)',
          headRefName: 'codex/jov-6586-shipping-terminal',
          body: `<!-- linear-issue-id:${ISSUE_ID} -->\n\nDurable terminal reconciliation remain required work in JOV-6586.`,
        }),
      ],
    });
    assert.equal(decision.transition, false);
    assert.equal(decision.reason, 'open-or-draft-linked-pull-request');
    assert.match(decision.detail, /#18293/);
  });

  it('does not move a commissioning or parent issue to Done', () => {
    const cases = [
      issue({
        identifier: 'JOV-5853',
        title: 'Commission Summer',
        labels: ['commissioning'],
      }),
      issue({
        identifier: 'JOV-7000',
        title: 'Commission Summer',
        labels: [],
      }),
      issue({
        identifier: 'JOV-7001',
        title: 'Ship the child slice',
        labels: ['parent'],
      }),
      issue({
        identifier: 'JOV-7002',
        title: 'Parent rollout',
        labels: [],
      }),
      issue({
        children: {
          complete: true,
          nodes: [
            {
              identifier: 'JOV-6586',
              state: { type: 'started', name: 'In Progress' },
            },
          ],
        },
      }),
    ];
    for (const candidate of cases) {
      const decision = decide({ issue: candidate, linkedPullRequests: [] });
      assert.equal(decision.transition, false, candidate.identifier);
      assert.ok(
        decision.reason === 'commissioning-or-parent-issue' ||
          decision.reason === 'open-sub-issues',
        decision.reason
      );
    }
    const parent = decide({
      issue: issue({ identifier: 'JOV-5853', title: 'Commission Summer' }),
    });
    assert.equal(parent.reason, 'commissioning-or-parent-issue');
    const childStillOpen = decide({
      issue: issue({
        children: {
          complete: true,
          nodes: [{ identifier: 'JOV-6586', state: { type: 'unstarted' } }],
        },
      }),
    });
    assert.equal(childStillOpen.reason, 'open-sub-issues');
  });

  it('holds when the merged body declares a stack or remaining required work', () => {
    const stack = decide({
      prBody:
        '## Dependent stack\n\nChild stays draft. Terminal execution proof remains follow-up work.',
    });
    assert.equal(stack.transition, false);
    assert.equal(stack.reason, 'dependent-stack');
    const remaining = decide({
      prBody:
        'Consumer acceptance and durable terminal reconciliation remain required work in JOV-6586.',
    });
    assert.equal(remaining.transition, false);
    assert.equal(remaining.reason, 'remaining-required-work');
  });

  it('fails closed when sibling or sub-issue evidence is incomplete', () => {
    assert.equal(
      decide({ siblingLookupComplete: false, linkedPullRequests: [] })
        .transition,
      false
    );
    assert.equal(
      decide({ issue: issue({ children: { complete: false, nodes: [] } }) })
        .reason,
      'sub-issue-lookup-incomplete'
    );
    assert.equal(
      decide({ issue: issue({ title: null }) }).reason,
      'issue-shape-incomplete'
    );
  });

  it('moves a leaf issue to Done when no linked work remains', () => {
    const refs = extractLinearRefs('', 'codex/jov-6586-shipping-lead-consumer');
    assert.equal(refs.issueIdentifier, 'JOV-6586');
    const decision = decide({
      linkedPullRequests: [
        pullRequest({ number: 18275, state: 'closed', isDraft: false }),
        pullRequest({
          number: 9,
          title: 'unrelated',
          body: '<!-- linear-issue-id:other -->',
          headRefName: 'codex/jov-1-other',
        }),
      ],
    });
    assert.deepEqual(decision, {
      transition: true,
      reason: 'clear',
      detail: '',
    });
    assert.equal(
      mergeComment({
        identifier: 'JOV-6586',
        prUrl: 'https://github.com/JovieInc/Jovie/pull/18275',
        mergeSha: 'abc',
        decision,
      }),
      'PR merged for JOV-6586: https://github.com/JovieInc/Jovie/pull/18275 (merge SHA: abc)'
    );
  });
});

describe('syncLinearOnMerge', () => {
  function linearIssuePayload(candidate = issue()) {
    return {
      data: {
        issue: {
          id: candidate.id,
          identifier: candidate.identifier,
          title: candidate.title,
          labels: {
            pageInfo: { hasNextPage: false },
            nodes: candidate.labels.map(name => ({ name })),
          },
          children: {
            pageInfo: { hasNextPage: candidate.children.complete === false },
            nodes: candidate.children.nodes,
          },
          team: {
            states: {
              nodes: [{ id: 'done-state', name: 'Done', type: 'completed' }],
            },
          },
        },
      },
    };
  }

  function mockFetch({ candidate, pulls, onCall }) {
    return async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      onCall({ url, body });
      if (String(url).includes('api.github.com')) {
        return {
          ok: true,
          json: async () =>
            pulls.map(pullRequest => ({
              number: pullRequest.number,
              draft: pullRequest.isDraft,
              title: pullRequest.title,
              body: pullRequest.body,
              head: { ref: pullRequest.headRefName },
            })),
        };
      }
      if (body?.query?.includes('issueUpdate')) {
        return {
          ok: true,
          json: async () => ({ data: { issueUpdate: { success: true } } }),
        };
      }
      if (body?.query?.includes('commentCreate')) {
        return {
          ok: true,
          json: async () => ({ data: { commentCreate: { success: true } } }),
        };
      }
      return { ok: true, json: async () => linearIssuePayload(candidate) };
    };
  }

  const env = {
    LINEAR_API_KEY: 'test-key',
    GITHUB_TOKEN: 'github-token',
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    PR_NUMBER: '18275',
    PR_URL: 'https://github.com/JovieInc/Jovie/pull/18275',
    MERGE_SHA: 'caae5898e7e44c8eddd2a58b0f7389f6662be6b3',
    HEAD_REF: 'codex/jov-6586-shipping-lead-consumer',
    PR_BODY: '## Dependent stack\n\nThe child stays draft.',
  };

  it('comments and does not transition when a draft layer is still open', async () => {
    const calls = [];
    const result = await syncLinearOnMerge(env, {
      fetchImpl: mockFetch({
        pulls: [
          pullRequest({
            number: 18293,
            isDraft: true,
            headRefName: 'codex/jov-6586-shipping-terminal',
          }),
        ],
        onCall: call => calls.push(call),
      }),
      log() {},
    });
    assert.equal(result.transitioned, false);
    assert.equal(result.commented, true);
    assert.equal(result.reason, 'open-or-draft-linked-pull-request');
    assert.equal(
      calls.some(call => call.body?.query?.includes('issueUpdate')),
      false
    );
    const comment = calls.find(call =>
      call.body?.query?.includes('commentCreate')
    );
    assert.match(comment.body.variables.body, /^PR merged for JOV-6586:/);
    assert.match(comment.body.variables.body, /Did not move to Done/);
    assert.match(comment.body.variables.body, /#18293/);
  });

  it('comments and does not transition a commissioning parent', async () => {
    const calls = [];
    const result = await syncLinearOnMerge(
      {
        ...env,
        HEAD_REF: 'codex/jov-5853-child',
        PR_BODY: 'Child slice only.',
      },
      {
        fetchImpl: mockFetch({
          candidate: issue({
            id: 'parent-id',
            identifier: 'JOV-5853',
            title: 'Commission Summer',
            labels: ['commissioning'],
          }),
          pulls: [],
          onCall: call => calls.push(call),
        }),
        log() {},
      }
    );
    assert.equal(result.transitioned, false);
    assert.equal(result.reason, 'commissioning-or-parent-issue');
    assert.equal(
      calls.some(call => call.body?.query?.includes('issueUpdate')),
      false
    );
  });

  it('transitions only after the guard is clear', async () => {
    const calls = [];
    const result = await syncLinearOnMerge(
      { ...env, PR_BODY: 'Leaf change. No further gate in this pull request.' },
      {
        fetchImpl: mockFetch({ pulls: [], onCall: call => calls.push(call) }),
        log() {},
      }
    );
    assert.deepEqual(result, {
      transitioned: true,
      commented: true,
      reason: 'clear',
    });
    assert.equal(
      calls.some(call => call.body?.query?.includes('issueUpdate')),
      true
    );
  });
});

describe('workflow wiring', () => {
  it('runs the guard and does not transition inline', () => {
    const workflow = readFileSync(
      fileURLToPath(
        new URL('../workflows/linear-sync-on-merge.yml', import.meta.url)
      ),
      'utf8'
    );
    assert.match(workflow, /jobs:\n {2}sync_done:/);
    assert.match(workflow, /runs-on: ubuntu-latest/);
    assert.match(workflow, /node \.github\/scripts\/linear-merge-close\.mjs/);
    assert.doesNotMatch(workflow, /issueUpdate/);
    assert.doesNotMatch(workflow, /SetIssueDone/);
  });
});
