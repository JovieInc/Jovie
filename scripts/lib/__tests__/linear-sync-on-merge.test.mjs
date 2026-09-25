import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMISSIONING_PARENT_ALLOWLIST,
  decideLinearCloseOnMerge,
  extractMergeIssueRef,
  listOpenPullRequests,
  pullRequestLinksIssue,
  syncLinearIssueOnMerge,
} from '../linear-sync-on-merge.mjs';

const MERGE_URL = 'https://github.com/JovieInc/Jovie/pull/18275';
const MERGE_SHA = 'eb6a0a68c92750dca7cd378732abf71c24c5558e';

function stackPull(overrides) {
  return {
    number: 1,
    title: 'feat(symphony): example (JOV-6586)',
    body: '',
    state: 'open',
    draft: true,
    headRef: 'codex/jov-6586-example',
    ...overrides,
  };
}

/** 2026-09-25 foundation merge. #18293 was still an open draft. */
const JOV_6586_STACK = [
  stackPull({
    number: 18275,
    title:
      'feat(symphony): validate bounded Shipping Lead admission (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-lead-consumer',
    state: 'closed',
    draft: false,
  }),
  stackPull({
    number: 18277,
    title: 'feat(symphony): bind shipping admission to verified runtime (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-runtime',
  }),
  stackPull({
    number: 18286,
    title:
      'feat(symphony): persist verified Shipping Lead acceptance (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-outcomes',
  }),
  stackPull({
    number: 18293,
    title:
      'feat(symphony): capture native Shipping Lead worker evidence (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-terminal',
  }),
];

const JOV_6586_ISSUE = {
  id: 'issue-6586',
  identifier: 'JOV-6586',
  labels: [],
  children: [],
  hasChildren: false,
};

const MERGING_FOUNDATION = {
  number: 18275,
  url: MERGE_URL,
  sha: MERGE_SHA,
};

describe('linear sync on merge', () => {
  it('reads the JOV-6586 branch the way the merge workflow did', () => {
    expect(
      extractMergeIssueRef({
        body: 'Integrator: commissioning task (JOV-6586). Related: JOV-6586.',
        headRef: 'codex/jov-6586-shipping-lead-consumer',
      })
    ).toEqual({
      identifier: 'JOV-6586',
      issueId: 'JOV-6586',
    });
    expect(
      extractMergeIssueRef({
        body: '<!-- linear-issue-id:9b1c -->\n<!-- linear-issue-identifier:JOV-6586 -->',
        headRef: 'codex/jov-1-other',
      })
    ).toEqual({ identifier: 'JOV-6586', issueId: '9b1c' });
  });

  it('links markers, branch names, and titles, and ignores prose-only mentions', () => {
    const issue = { identifier: 'JOV-6586', issueId: 'uuid-6586' };
    expect(
      pullRequestLinksIssue(
        {
          title: 'unrelated',
          body: '<!-- linear-issue-id:uuid-6586 -->',
          headRef: 'feature/no-ticket',
        },
        issue
      )
    ).toBe(true);
    expect(
      pullRequestLinksIssue(
        {
          title: 'no identifier',
          body: '',
          headRef: 'codex/jov-6586-shipping-terminal',
        },
        issue
      )
    ).toBe(true);
    expect(
      pullRequestLinksIssue(
        {
          title: 'capture evidence (JOV-6586)',
          body: '',
          headRef: 'feature/no-ticket',
        },
        issue
      )
    ).toBe(true);
    expect(
      pullRequestLinksIssue(
        {
          title: 'mention only',
          body: 'See JOV-6586 for context.',
          headRef: 'codex/jov-65860-other',
        },
        issue
      )
    ).toBe(false);
  });

  it('keeps JOV-6586 open when the foundation merges and the final layer is still draft', () => {
    const decision = decideLinearCloseOnMerge({
      issue: JOV_6586_ISSUE,
      pullRequests: JOV_6586_STACK,
      mergingPull: MERGING_FOUNDATION,
    });

    expect(decision.action).toBe('skip');
    expect(decision.blockingNumbers).toEqual([18277, 18286, 18293]);
    expect(decision.comment).toContain(
      `Did not mark JOV-6586 Done after ${MERGE_URL} merged`
    );
    expect(decision.comment).toContain('#18293 (draft)');
    expect(decision.comment).not.toContain('PR merged for JOV-6586');
  });

  it('keeps JOV-6586 open when only the final draft layer is still open', () => {
    const decision = decideLinearCloseOnMerge({
      issue: JOV_6586_ISSUE,
      pullRequests: [
        JOV_6586_STACK[0],
        { ...JOV_6586_STACK[1], state: 'closed', draft: false },
        { ...JOV_6586_STACK[2], state: 'closed', draft: false },
        JOV_6586_STACK[3],
      ],
      mergingPull: MERGING_FOUNDATION,
    });

    expect(decision.action).toBe('skip');
    expect(decision.blockingNumbers).toEqual([18293]);
  });

  it('marks JOV-6586 Done only after every linked pull request has merged', () => {
    const decision = decideLinearCloseOnMerge({
      issue: JOV_6586_ISSUE,
      pullRequests: JOV_6586_STACK.map(pull => ({
        ...pull,
        state: 'closed',
        draft: false,
      })),
      mergingPull: {
        number: 18293,
        url: 'https://github.com/JovieInc/Jovie/pull/18293',
        sha: 'terminal-sha',
      },
    });

    expect(decision.action).toBe('close');
    expect(decision.comment).toBe(
      'PR merged for JOV-6586: https://github.com/JovieInc/Jovie/pull/18293 (merge SHA: terminal-sha)'
    );
  });

  it('does not close commissioning parent JOV-5853 when a child pull request merges', () => {
    expect(COMMISSIONING_PARENT_ALLOWLIST.has('JOV-5853')).toBe(true);
    const decision = decideLinearCloseOnMerge({
      issue: {
        id: 'issue-5853',
        identifier: 'JOV-5853',
        labels: [],
        children: [],
        hasChildren: false,
      },
      pullRequests: [
        {
          number: 18010,
          title: 'fix(symphony): retain execution delivery',
          body: '',
          state: 'closed',
          draft: false,
          headRef: 'codex/jov-5853-execution-journal',
        },
      ],
      mergingPull: {
        number: 18010,
        url: 'https://github.com/JovieInc/Jovie/pull/18010',
        sha: 'parent-child-sha',
      },
    });

    expect(decision.action).toBe('skip');
    expect(decision.blockingNumbers).toEqual([]);
    expect(decision.comment).toContain('JOV-5853 is a commissioning or parent issue');
    expect(decision.comment).toContain('allowlist');
    expect(decision.comment).toContain('Did not mark JOV-5853 Done');
  });

  it('holds a parent by commissioning label or sub-issues without the allowlist', () => {
    const labeled = decideLinearCloseOnMerge({
      issue: {
        id: 'issue-parent',
        identifier: 'JOV-7000',
        labels: ['commissioning'],
        children: [],
        hasChildren: false,
      },
      pullRequests: [],
      mergingPull: MERGING_FOUNDATION,
      allowlist: new Set(),
    });
    const withChildren = decideLinearCloseOnMerge({
      issue: {
        id: 'issue-parent',
        identifier: 'JOV-7001',
        labels: [],
        children: ['JOV-6586'],
        hasChildren: true,
      },
      pullRequests: [],
      mergingPull: MERGING_FOUNDATION,
      allowlist: new Set(),
    });

    expect(labeled.action).toBe('skip');
    expect(labeled.comment).toContain('label commissioning');
    expect(withChildren.action).toBe('skip');
    expect(withChildren.comment).toContain('sub-issues JOV-6586');
  });

  it('ignores the merging pull request if the open list is stale', () => {
    const decision = decideLinearCloseOnMerge({
      issue: {
        id: 'issue-1',
        identifier: 'JOV-100',
        labels: [],
        children: [],
      },
      pullRequests: [
        {
          number: 5,
          title: 'JOV-100',
          body: '',
          state: 'open',
          draft: false,
          headRef: 'codex/jov-100-fix',
        },
      ],
      mergingPull: {
        number: 5,
        url: 'https://github.com/JovieInc/Jovie/pull/5',
        sha: 'abc',
      },
    });

    expect(decision.action).toBe('close');
  });

  it('posts the hold comment and does not transition JOV-6586 while #18293 is draft', async () => {
    const calls = [];
    const result = await syncLinearIssueOnMerge({
      env: {
        LINEAR_API_KEY: 'lin_test',
        GITHUB_TOKEN: 'gh_test',
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        PR_NUMBER: '18275',
        PR_URL: MERGE_URL,
        PR_BODY: 'No marker, branch carries the issue.',
        HEAD_REF: 'codex/jov-6586-shipping-lead-consumer',
        MERGE_SHA,
      },
      log: () => {},
      fetchImpl: async (url, init) => {
        const body = String(init?.body ?? '');
        calls.push({ url: String(url), body });
        if (String(url).includes('api.linear.app') && body.includes('IssueDoneState')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                issue: {
                  id: 'uuid-6586',
                  identifier: 'JOV-6586',
                  labels: { nodes: [] },
                  children: { nodes: [] },
                  team: {
                    states: {
                      nodes: [{ id: 'done-state', name: 'Done', type: 'completed' }],
                    },
                  },
                },
              },
            }),
          };
        }
        if (String(url).includes('api.github.com')) {
          return {
            ok: true,
            headers: { get: () => '' },
            json: async () =>
              JOV_6586_STACK.filter(pull => pull.state === 'open').map(pull => ({
                number: pull.number,
                title: pull.title,
                body: pull.body,
                state: pull.state,
                draft: pull.draft,
                head: { ref: pull.headRef },
              })),
          };
        }
        return {
          ok: true,
          json: async () => ({ data: { commentCreate: { success: true } } }),
        };
      },
    });

    expect(result.action).toBe('skip');
    expect(result.identifier).toBe('JOV-6586');
    expect(result.comment).toContain('#18293 (draft)');
    expect(calls.some(call => call.body.includes('issueUpdate'))).toBe(false);
    expect(calls.some(call => call.body.includes('commentCreate'))).toBe(true);
    expect(calls.some(call => call.body.includes('#18293 (draft)'))).toBe(true);
  });

  it('does not transition commissioning parent JOV-5853', async () => {
    const calls = [];
    const result = await syncLinearIssueOnMerge({
      env: {
        LINEAR_API_KEY: 'lin_test',
        GITHUB_TOKEN: 'gh_test',
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        PR_NUMBER: '18010',
        PR_URL: 'https://github.com/JovieInc/Jovie/pull/18010',
        PR_BODY: '',
        HEAD_REF: 'codex/jov-5853-execution-journal',
        MERGE_SHA: 'parent-child-sha',
      },
      log: () => {},
      fetchImpl: async (url, init) => {
        const body = String(init?.body ?? '');
        calls.push(body);
        if (String(url).includes('api.linear.app') && body.includes('IssueDoneState')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                issue: {
                  id: 'uuid-5853',
                  identifier: 'JOV-5853',
                  labels: { nodes: [{ name: 'commissioning' }] },
                  children: { nodes: [{ identifier: 'JOV-6586' }] },
                  team: {
                    states: {
                      nodes: [{ id: 'done-state', name: 'Done', type: 'completed' }],
                    },
                  },
                },
              },
            }),
          };
        }
        if (String(url).includes('api.github.com')) {
          return {
            ok: true,
            headers: { get: () => '' },
            json: async () => [],
          };
        }
        return {
          ok: true,
          json: async () => ({ data: { commentCreate: { success: true } } }),
        };
      },
    });

    expect(result.action).toBe('skip');
    expect(result.comment).toContain('allowlist');
    expect(result.comment).toContain('label commissioning');
    expect(result.comment).toContain('sub-issues JOV-6586');
    expect(calls.some(body => body.includes('issueUpdate'))).toBe(false);
  });

  it('follows GitHub pagination and holds when the scan is incomplete', async () => {
    const pages = [];
    const listed = await listOpenPullRequests({
      token: 'gh_test',
      repository: 'JovieInc/Jovie',
      maxPages: 1,
      fetchImpl: async url => {
        pages.push(String(url));
        return {
          ok: true,
          headers: {
            get: () =>
              '<https://api.github.com/repos/JovieInc/Jovie/pulls?page=2>; rel="next"',
          },
          json: async () => [
            {
              number: 18293,
              title: 'final (JOV-6586)',
              body: '',
              state: 'open',
              draft: true,
              head: { ref: 'codex/jov-6586-shipping-terminal' },
            },
          ],
        };
      },
    });
    expect(pages).toHaveLength(1);
    expect(listed.complete).toBe(false);
    expect(listed.pulls[0].draft).toBe(true);

    const decision = decideLinearCloseOnMerge({
      issue: JOV_6586_ISSUE,
      pullRequests: [],
      mergingPull: MERGING_FOUNDATION,
      scanComplete: false,
    });
    expect(decision.action).toBe('skip');
    expect(decision.comment).toContain('stopped before the last page');
  });

  it('comments and fails closed when the open pull request scan errors', async () => {
    await expect(
      syncLinearIssueOnMerge({
        env: {
          LINEAR_API_KEY: 'lin_test',
          GITHUB_TOKEN: 'gh_test',
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          PR_NUMBER: '18275',
          PR_URL: MERGE_URL,
          PR_BODY: '',
          HEAD_REF: 'codex/jov-6586-shipping-lead-consumer',
          MERGE_SHA,
        },
        log: () => {},
        fetchImpl: async (url, init) => {
          const body = String(init?.body ?? '');
          if (String(url).includes('api.github.com')) {
            return { ok: false, status: 503, json: async () => ({}) };
          }
          if (body.includes('IssueDoneState')) {
            return {
              ok: true,
              json: async () => ({
                data: {
                  issue: {
                    id: 'uuid-6586',
                    identifier: 'JOV-6586',
                    labels: { nodes: [] },
                    children: { nodes: [] },
                    team: {
                      states: {
                        nodes: [
                          { id: 'done-state', name: 'Done', type: 'completed' },
                        ],
                      },
                    },
                  },
                },
              }),
            };
          }
          expect(body.includes('issueUpdate')).toBe(false);
          expect(body).toContain('stopped before the last page');
          return {
            ok: true,
            json: async () => ({ data: { commentCreate: { success: true } } }),
          };
        },
      })
    ).rejects.toThrow(/open pull request scan failed/);
  });

  it('delegates the workflow close to the script', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/linear-sync-on-merge.yml'
      ),
      'utf8'
    );
    expect(workflow).toContain('node scripts/lib/linear-sync-on-merge.mjs');
    expect(workflow).toContain('sync_done:');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('issueUpdate');
  });
});
