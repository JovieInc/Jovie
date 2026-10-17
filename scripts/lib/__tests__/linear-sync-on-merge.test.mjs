import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { formatDeprecationObservation } from '../deprecation-observation.mjs';
import {
  COMMISSIONING_PARENT_ALLOWLIST,
  extractMergeIssueRef,
  failureDisposition,
  installationQuotaClassifierReady,
  isInstallationQuota403,
  lifecycleHolds,
  listOpenPullRequests,
  parentHoldReason,
  pullRequestLinksIssue,
  recordValidationReceipt,
  syncLinearIssueOnMerge,
} from '../linear-sync-on-merge.mjs';
import {
  createWorld,
  HARNESS_MANIFEST,
  intercept,
  json,
  MAIN,
  NO_UI_MATRIX,
  REPO,
  receiptComment,
  validClosure,
} from './fixtures/validation-world.mjs';

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
    title:
      'feat(symphony): bind shipping admission to verified runtime (JOV-6586)',
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

const BASE_ENV = {
  LINEAR_API_KEY: 'lin_test',
  GITHUB_TOKEN: 'gh_test',
  GITHUB_REPOSITORY: REPO,
};

function mergeEvent(fetchImpl, number, identifier = 'JOV-1', env = {}) {
  return syncLinearIssueOnMerge({
    env: {
      ...BASE_ENV,
      PR_NUMBER: String(number),
      PR_BODY: `<!-- linear-issue-identifier:${identifier} -->`,
      HEAD_REF: 'feature/no-ticket',
      ...env,
    },
    fetchImpl,
    harnessManifest: HARNESS_MANIFEST,
    assuranceMatrix: NO_UI_MATRIX,
    verifyMarker: () => true,
    log: () => {},
  });
}

function sweep(fetchImpl) {
  return syncLinearIssueOnMerge({
    env: { ...BASE_ENV, LIFECYCLE_MODE: 'sweep' },
    fetchImpl,
    harnessManifest: HARNESS_MANIFEST,
    assuranceMatrix: NO_UI_MATRIX,
    verifyMarker: () => true,
    log: () => {},
  });
}

function blockingRelation(name = 'Merging', overrides = {}) {
  return {
    id: 'relation-8316',
    type: 'blocks',
    issue: {
      id: 'uuid-8316',
      identifier: 'JOV-8316',
      state: {
        id: `state-${name}`,
        name,
        type:
          name === 'Done'
            ? 'completed'
            : name === 'Canceled'
              ? 'canceled'
              : 'started',
      },
    },
    ...overrides,
  };
}

describe('linear sync on merge', () => {
  it.each(['Merging', 'Rework', 'Canceled', 'Unknown'])(
    'keeps passing acceptance open for an incoming %s prerequisite',
    async name => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      issue.state = 'Validating';
      issue.inverseRelations = [blockingRelation(name)];
      const result = await mergeEvent(fetchImpl, 101);
      expect(result.results[0].target).toBe('Validating');
      expect(world.updates).toEqual([]);
      expect(result.results[0].comment).toContain(
        `Blocking prerequisite JOV-8316 is ${name}`
      );
      const count = world.comments.length;
      await mergeEvent(fetchImpl, 101);
      expect(world.comments).toHaveLength(count);
      // Changed dependency state needs an actionable comment even when this
      // issue's own updatedAt and receipt set have not changed.
      issue.inverseRelations = [blockingRelation('In Progress')];
      await mergeEvent(fetchImpl, 101);
      expect(world.comments).toHaveLength(count + 1);
    }
  );

  it('closes when incoming prerequisites are Done and ignores unrelated/outgoing edges', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].inverseRelations = [
      blockingRelation('Done'),
      { id: 'related', type: 'related' },
    ];
    // No outgoing relation is queried: this issue blocking another is not
    // evidence that this issue depends on the downstream work.
    world.issues['JOV-1'].relations = [blockingRelation('Merging')];
    expect((await mergeEvent(fetchImpl, 101)).results[0].target).toBe('Done');
    expect(world.updates).toEqual(['JOV-1:Done']);
  });

  it('routes a required failed outcome to Rework despite an open prerequisite', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.description = '- [ ] Verify production outcome';
    issue.comments.push(
      receiptComment('JOV-1', { status: 'fail' }, '2026-10-03T11:30:00Z')
    );
    issue.inverseRelations = [blockingRelation()];
    expect((await mergeEvent(fetchImpl, 101)).results[0].target).toBe('Rework');
    expect(world.updates).toEqual(['JOV-1:Rework']);
  });

  it.each([
    { id: 'state-done', name: 'Done', type: 'started' },
    { id: 'state-accepted', name: 'Accepted', type: 'completed' },
  ])(
    'does not equate an inconsistent or noncanonical terminal state with Done: %j',
    async state => {
      const { world, fetchImpl } = createWorld();
      const relation = blockingRelation();
      relation.issue.state = state;
      world.issues['JOV-1'].state = 'Validating';
      world.issues['JOV-1'].inverseRelations = [relation];
      expect((await mergeEvent(fetchImpl, 101)).results[0].target).toBe(
        'Validating'
      );
      expect(world.updates).toEqual([]);
    }
  );

  it.each(['new edge', 'reopened prerequisite', 'removed edge'])(
    'defers closure on a changed blocking dependency without an issue-version change: %s',
    async change => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      issue.state = 'Validating';
      issue.inverseRelations =
        change === 'new edge' ? [] : [blockingRelation('Done')];
      let changed = false;
      const racing = intercept(fetchImpl, async url => {
        if (!changed && url.includes('/pulls/101/files')) {
          changed = true;
          issue.inverseRelations =
            change === 'removed edge' ? [] : [blockingRelation('Merging')];
        }
        return null;
      });
      expect((await mergeEvent(racing, 101)).action).toBe('skip');
      expect(changed).toBe(true);
      expect(world.updates).toEqual([]);
      expect(world.comments).toEqual([]);
    }
  );

  it('reads a blocking prerequisite on a later relation page before acceptance', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Validating';
    let laterReads = 0;
    const paginated = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycle(')) {
        const data = await (await next()).json();
        data.data.issue.inverseRelations = {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: 'next-blocker' },
        };
        return json(data);
      }
      if (body?.query?.includes('IssueLifecycleBlockers')) {
        laterReads++;
        expect(body.variables.after).toBe('next-blocker');
        return json({
          data: {
            issue: {
              inverseRelations: {
                nodes: [blockingRelation()],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      }
      return null;
    });
    expect((await mergeEvent(paginated, 101)).results[0].target).toBe(
      'Validating'
    );
    expect(laterReads).toBe(1);
    expect(world.updates).toEqual([]);
  });

  it('re-reads a later-page prerequisite state before writing Done', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Validating';
    let laterReads = 0;
    const racing = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycle(')) {
        const data = await (await next()).json();
        data.data.issue.inverseRelations = {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: 'next-blocker' },
        };
        return json(data);
      }
      if (body?.query?.includes('IssueLifecycleBlockers')) {
        laterReads++;
        return json({
          data: {
            issue: {
              inverseRelations: {
                nodes: [
                  blockingRelation(laterReads === 1 ? 'Done' : 'Merging'),
                ],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        });
      }
      return null;
    });
    expect((await mergeEvent(racing, 101)).action).toBe('skip');
    expect(laterReads).toBe(2);
    expect(world.updates).toEqual([]);
    expect(world.comments).toEqual([]);
  });

  it.each(
    [
      'missing connection',
      'malformed edge',
      'duplicate relation',
      'missing state',
      'missing cursor',
      'repeated cursor',
      'page bound',
      'unreadable next page',
    ].flatMap(condition =>
      ['snapshot', 'prewrite'].map(stage => [condition, stage])
    )
  )(
    'fails closed on incomplete blocking evidence: %s during %s',
    async (condition, stage) => {
      const { world, fetchImpl } = createWorld();
      world.issues['JOV-1'].state = 'Validating';
      let pages = 0;
      let reads = 0;
      const broken = intercept(fetchImpl, async (_url, body, next) => {
        if (body?.query?.includes('IssueLifecycle(')) {
          reads++;
          if (stage === 'prewrite' && reads !== 2) return null;
          const data = await (await next()).json();
          const connection = data.data.issue.inverseRelations;
          if (condition === 'missing connection')
            delete data.data.issue.inverseRelations;
          else if (condition === 'malformed edge')
            connection.nodes = [{ id: 'unknown' }];
          else if (condition === 'missing state')
            connection.nodes = [
              blockingRelation('Done', {
                issue: { id: 'uuid-8316', identifier: 'JOV-8316', state: null },
              }),
            ];
          else {
            if (condition === 'duplicate relation')
              connection.nodes = [blockingRelation('Done')];
            connection.pageInfo = {
              hasNextPage: true,
              endCursor: condition === 'missing cursor' ? null : 'first',
            };
          }
          return json(data);
        }
        if (body?.query?.includes('IssueLifecycleBlockers')) {
          pages++;
          return json({
            data: {
              issue: {
                inverseRelations:
                  condition === 'unreadable next page'
                    ? null
                    : {
                        nodes:
                          condition === 'duplicate relation'
                            ? [blockingRelation('Done')]
                            : [],
                        pageInfo: {
                          hasNextPage: condition !== 'duplicate relation',
                          endCursor:
                            condition === 'repeated cursor'
                              ? 'first'
                              : `page-${pages}`,
                        },
                      },
              },
            },
          });
        }
        return null;
      });
      await expect(mergeEvent(broken, 101)).rejects.toThrow(
        /blocking dependency/i
      );
      expect(pages).toBeLessThanOrEqual(19);
      expect(world.updates).toEqual([]);
      expect(world.comments).toEqual([]);
    }
  );

  it.each([
    'reopened episode',
    'acceptance edit',
    'new failed receipt',
    'reopened episode without issue-version change',
    'acceptance edit without issue-version change',
    'new failed receipt without issue-version change',
    'edited receipt without issue-version change',
    'child reopen without issue-version change',
    'child delivery without issue-version change',
  ])('does not close from a changed Linear preimage: %s', async change => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.description = '- [ ] Verify the actual production outcome';
    issue.children = [['JOV-2', 'completed', '2026-10-03T11:00:00Z']];
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T11:30:00Z'));
    let changed = false;
    const racing = intercept(fetchImpl, async url => {
      // The full issue preimage has already been read. Change it while
      // GitHub facts are collected, before the existing state re-read.
      if (!changed && url.includes('/pulls/101/files')) {
        changed = true;
        if (change.startsWith('reopened episode')) {
          issue.state = 'Done';
          issue.history.push({
            createdAt: '2026-10-03T12:05:00Z',
            fromState: { type: 'completed' },
            toState: { type: 'started' },
          });
          issue.state = 'Validating';
        } else if (change.startsWith('acceptance edit')) {
          issue.description += '\n- [ ] Verify the new acceptance condition';
        } else if (change.startsWith('child reopen')) {
          issue.children = [['JOV-2', 'started']];
        } else if (change.startsWith('edited receipt')) {
          issue.comments[0].body = receiptComment('JOV-1', {
            status: 'fail',
          }).body;
        } else {
          issue.comments.push(
            receiptComment('JOV-1', { status: 'fail' }, '2026-10-03T12:05:00Z')
          );
        }
        if (!change.endsWith('without issue-version change')) {
          issue.updatedAt = '2026-10-03T12:05:00Z';
        }
      }
      return null;
    });
    const result = await mergeEvent(racing, 101);
    expect(changed).toBe(true);
    expect(result.action).toBe('skip');
    expect(result.results).toEqual([
      expect.objectContaining({ action: 'skip', target: null, comment: '' }),
    ]);
    expect(world.updates).toEqual([]);
    expect(world.comments).toEqual([]);
    expect(issue.state).toBe('Validating');
  });

  it('closes from a stable server preimage after the immediate state re-read', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Validating';
    const queries = [];
    const observed = intercept(fetchImpl, async (_url, body) => {
      if (body?.query) queries.push(body.query);
      return null;
    });
    expect((await mergeEvent(observed, 101)).action).toBe('moved');
    expect(world.updates).toEqual(['JOV-1:Done']);
    expect(queries.find(query => query.includes('IssueLifecycle('))).toContain(
      'updatedAt'
    );
    const write = queries.findIndex(query =>
      query.includes('SetLifecycleState')
    );
    expect(queries[write - 1]).toContain('IssueLifecycle(');
    expect(queries[write - 1]).toContain('updatedAt');
  });

  it.each([
    ['snapshot', undefined],
    ['snapshot', 'not-a-server-time'],
    ['prewrite', undefined],
    ['prewrite', 'not-a-server-time'],
  ])('fails closed on an unreadable %s version (%s)', async (stage, value) => {
    const { world, fetchImpl } = createWorld();
    let reads = 0;
    const unreadable = intercept(fetchImpl, async (_url, body, next) => {
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      reads += 1;
      if (reads !== (stage === 'snapshot' ? 1 : 2)) return null;
      const response = await (await next()).json();
      response.data.issue.updatedAt = value;
      return json(response);
    });
    await expect(mergeEvent(unreadable, 101)).rejects.toThrow(
      /unreadable lifecycle preimage/i
    );
    expect(world.updates).toEqual([]);
    expect(world.comments).toEqual([]);
  });

  it.each(['receipt comment', 'child reopen'])(
    'detects a changed %s on a later prewrite page with the same issue version',
    async changed => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      issue.state = 'Validating';
      issue.children = [
        ['JOV-2', 'completed', '2026-10-03T11:00:00Z'],
        ['JOV-3', 'completed', '2026-10-03T11:00:00Z'],
      ];
      issue.comments.push(
        { body: 'Earlier owner note', createdAt: '2026-10-03T11:00:00Z' },
        receiptComment('JOV-1', {}, '2026-10-03T11:30:00Z')
      );
      let reads = 0;
      let pages = 0;
      let remainder;
      const paged = intercept(fetchImpl, async (_url, body, next) => {
        if (body?.query?.includes('IssueLifecycle(')) {
          reads += 1;
          if (reads !== 2) return null;
          const response = await (await next()).json();
          const key = changed === 'receipt comment' ? 'comments' : 'children';
          const nodes = response.data.issue[key].nodes;
          remainder = nodes.slice(1).map(node =>
            changed === 'receipt comment'
              ? {
                  ...node,
                  body: receiptComment('JOV-1', { status: 'fail' }).body,
                }
              : { ...node, state: { type: 'started' }, completedAt: null }
          );
          response.data.issue[key] = {
            nodes: nodes.slice(0, 1),
            pageInfo: { hasNextPage: true, endCursor: 'prewrite-page' },
          };
          return json(response);
        }
        const query =
          changed === 'receipt comment'
            ? 'IssueLifecycleComments'
            : 'IssueLifecycleChildren';
        if (!body?.query?.includes(query)) return null;
        pages += 1;
        const key = changed === 'receipt comment' ? 'comments' : 'children';
        return json({
          data: {
            issue: {
              [key]: {
                nodes: remainder,
                pageInfo: { hasNextPage: false },
              },
            },
          },
        });
      });
      expect((await mergeEvent(paged, 101)).action).toBe('skip');
      expect(reads).toBe(2);
      expect(pages).toBe(1);
      expect(world.updates).toEqual([]);
      expect(world.comments).toEqual([]);
      expect(issue.state).toBe('Validating');
    }
  );

  it.each(['missing issue', 'missing comments', 'unreadable comment page'])(
    'fails closed on an unreadable current preimage: %s',
    async failure => {
      const { world, fetchImpl } = createWorld();
      let reads = 0;
      const unreadable = intercept(fetchImpl, async (_url, body, next) => {
        if (body?.query?.includes('IssueLifecycleComments')) {
          return json({ data: {} });
        }
        if (!body?.query?.includes('IssueLifecycle(')) return null;
        reads += 1;
        if (reads !== 2) return null;
        const response = await (await next()).json();
        if (failure === 'missing issue') response.data.issue = null;
        else if (failure === 'missing comments')
          delete response.data.issue.comments;
        else
          response.data.issue.comments = {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: 'unreadable' },
          };
        return json(response);
      });
      await expect(mergeEvent(unreadable, 101)).rejects.toThrow(
        /unreadable lifecycle preimage/i
      );
      expect(world.updates).toEqual([]);
      expect(world.comments).toEqual([]);
    }
  );

  it('accepts the same semantic preimage in a different server list order', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.labels = ['label-a', 'label-b'];
    issue.children = [
      ['JOV-2', 'completed', '2026-10-03T11:00:00Z'],
      ['JOV-3', 'completed', '2026-10-03T11:00:00Z'],
    ];
    issue.inverseRelations = [
      blockingRelation('Done'),
      blockingRelation('Done', { id: 'relation-other' }),
    ];
    issue.comments.push(
      { body: 'Earlier note', createdAt: '2026-10-03T11:00:00Z' },
      receiptComment('JOV-1', {}, '2026-10-03T11:30:00Z')
    );
    let reads = 0;
    const reordered = intercept(fetchImpl, async (_url, body, next) => {
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      reads += 1;
      if (reads !== 2) return null;
      const response = await (await next()).json();
      for (const key of [
        'labels',
        'children',
        'comments',
        'inverseRelations',
      ]) {
        response.data.issue[key].nodes = [
          ...response.data.issue[key].nodes,
        ].reverse();
      }
      response.data.issue.team.states.nodes = [
        ...response.data.issue.team.states.nodes,
      ].reverse();
      return json(response);
    });
    expect((await mergeEvent(reordered, 101)).action).toBe('moved');
    expect(world.updates).toEqual(['JOV-1:Done']);
  });

  it('preserves receipt order when fail and pass share the same server timestamp', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.description = '- [ ] Production outcome required';
    issue.comments.push(
      receiptComment('JOV-1', { status: 'fail' }, '2026-10-03T11:30:00Z'),
      receiptComment('JOV-1', { status: 'pass' }, '2026-10-03T11:30:00Z')
    );
    let reads = 0;
    const reversed = intercept(fetchImpl, async (_url, body, next) => {
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      reads += 1;
      if (reads !== 2) return null;
      const response = await (await next()).json();
      response.data.issue.comments.nodes = [
        ...response.data.issue.comments.nodes,
      ].reverse();
      return json(response);
    });
    // The old snapshot selects pass; the current equal-time order selects
    // fail. The preimage guard must defer instead of writing the old Done.
    expect((await mergeEvent(reversed, 101)).action).toBe('skip');
    expect(reads).toBe(2);
    expect(world.updates).toEqual([]);
    expect(world.comments).toEqual([]);
    expect(issue.state).toBe('Validating');
  });

  it('does not add a complete preimage re-read for a kept issue', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Validating';
    world.issues['JOV-1'].description = '- [ ] Outcome still required';
    let reads = 0;
    const counted = intercept(fetchImpl, async (_url, body) => {
      if (body?.query?.includes('IssueLifecycle(')) reads += 1;
      return null;
    });
    expect((await mergeEvent(counted, 101)).action).toBe('kept');
    expect(reads).toBe(1);
    expect(world.updates).toEqual([]);
  });

  it.each(['completed', 'canceled'])(
    'holds unknown %s child delivery timestamps',
    async type => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      issue.state = 'In Progress';
      issue.attachments = [];
      issue.children = [['JOV-2', type, null]];
      issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
      await expect(sweep(fetchImpl)).rejects.toThrow(
        'Child delivery timestamp'
      );
      expect(world.updates).toEqual([]);
    }
  );

  it('holds partial child delivery evidence without accepting the parent outcome', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'In Progress';
    issue.children = [['JOV-2', 'completed']];
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
    const partial = intercept(fetchImpl, async (url, body, next) => {
      if (
        String(url) === 'https://api.linear.app/graphql' &&
        body?.query?.includes('IssueLifecycle(')
      ) {
        const response = await next();
        const payload = await response.json();
        payload.data.issue.children.pageInfo.hasNextPage = true;
        return json(payload);
      }
      return undefined;
    });
    await expect(sweep(partial)).rejects.toThrow('Child delivery evidence');
    expect(world.updates).toEqual([]);
  });

  it('pages JOV-5853 child evidence and still closes a shipped child', async () => {
    const { world, fetchImpl } = createWorld();
    world.pulls[202] = {
      mergeSha: MAIN[1],
      mergedAt: '2026-10-03T10:00:00Z',
      files: ['apps/web/components/Card.tsx'],
      headRef: 'tim/jov-2-shipped-child',
    };
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      state: 'Merging',
      updatedAt: '2026-10-03T13:00:00Z',
      attachments: [`https://github.com/${REPO}/pull/202`],
      children: [],
    };
    world.issues['JOV-5853'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-5853',
      identifier: 'JOV-5853',
      title: 'commission: fleet readiness',
      state: 'In Progress',
      updatedAt: '2026-10-03T09:00:00Z',
      attachments: [],
      children: [['JOV-2', 'started']],
    };
    const paged = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycleChildren')) {
        expect(body.variables.issueId).toBe('uuid-5853');
        expect(body.variables.after).toBe('c1');
        return json({
          data: {
            issue: {
              children: {
                nodes: [
                  {
                    identifier: 'JOV-4',
                    state: { type: 'completed' },
                    completedAt: '2026-10-03T11:00:00Z',
                    canceledAt: null,
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      }
      if (!body?.query?.includes('LifecycleIssueBatch')) return null;
      const payload = await (await next()).json();
      for (const node of Object.values(payload.data)) {
        if (node?.identifier !== 'JOV-5853') continue;
        node.children.pageInfo = { hasNextPage: true, endCursor: 'c1' };
      }
      return json(payload);
    });
    await sweep(paged);
    expect(world.issues['JOV-2'].state).toBe('Done');
    expect(world.issues['JOV-5853'].state).toBe('In Progress');
  });

  it.each([false, true])(
    'requires a fresh parent outcome after child delivery (parent PR=%s)',
    async hasPull => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      issue.state = 'In Progress';
      issue.attachments = hasPull ? issue.attachments : [];
      issue.children = [['JOV-2', 'started']];
      issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
      await sweep(fetchImpl);
      expect(issue.state).toBe('In Progress');
      issue.children = [['JOV-2', 'completed', '2026-10-03T14:00:00Z']];
      await sweep(fetchImpl);
      expect(issue.state).toBe(hasPull ? 'Validating' : 'In Progress');
      issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
      await sweep(fetchImpl);
      expect(issue.state).toBe('Done');
    }
  );

  it('retains a parent without its own outcome, then closes from fresh verified proof without inventing a parent PR', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'In Progress';
    issue.children = [['JOV-2', 'completed']];
    issue.attachments = [];
    await sweep(fetchImpl);
    expect(issue.state).toBe('In Progress');
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
    await sweep(fetchImpl);
    await sweep(fetchImpl);
    expect(issue.state).toBe('Done');
    expect(world.updates).toEqual(['JOV-1:Done']);
    expect(issue.comments.at(-1).body).toContain('Binding outcome:');
  });

  it('does not bind a parent to an old-episode outcome arriving after its reopen', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'In Progress';
    issue.attachments = [];
    issue.children = [['JOV-2', 'completed', '2026-10-03T13:00:00Z']];
    issue.history = [
      {
        createdAt: '2026-10-03T14:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
    ];
    issue.comments.push(
      receiptComment(
        'JOV-1',
        { episodeStartedAt: null },
        '2026-10-03T15:00:00Z'
      )
    );
    await sweep(fetchImpl);
    expect(issue.state).toBe('In Progress');
    expect(world.updates).toEqual([]);
    issue.comments.push(
      receiptComment(
        'JOV-1',
        { episodeStartedAt: '2026-10-03T10:00:00-04:00' },
        '2026-10-03T16:00:00Z'
      )
    );
    await sweep(fetchImpl);
    expect(issue.state).toBe('Done');
  });

  it('does not let an ordinary unmerged issue use a recorded outcome to bypass source delivery', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.attachments = [];
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
    await mergeEvent(fetchImpl, 0);
    expect(world.updates).toEqual([]);
  });

  it.each([
    ['open child', { children: [['JOV-2', 'started']] }, {}, 'In Progress'],
    ['failed outcome', {}, { status: 'fail' }, 'Rework'],
    ['outcome build not deployed', {}, { sha: MAIN[3] }, 'Merging'],
    [
      'reopened episode',
      {
        history: [
          {
            createdAt: '2026-10-03T14:00:00Z',
            fromState: { type: 'completed' },
            toState: { type: 'started' },
          },
        ],
      },
      {},
      'In Progress',
    ],
  ])(
    'retains the parent gate for %s',
    async (_name, changes, proof, expected) => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      Object.assign(
        issue,
        {
          state: 'In Progress',
          attachments: [],
          children: [['JOV-2', 'completed']],
        },
        changes
      );
      issue.comments.push(
        receiptComment('JOV-1', proof, '2026-10-03T13:00:00Z')
      );
      await sweep(fetchImpl);
      expect(issue.state).toBe(expected);
    }
  );

  it('does not fall back to an old parent pass when its latest evidence is malformed', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    Object.assign(issue, {
      state: 'In Progress',
      attachments: [],
      children: [['JOV-2', 'completed']],
    });
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
    issue.comments.push({
      body: '<!-- validation-receipt:v1\n{broken}\n-->',
      createdAt: '2026-10-03T14:00:00Z',
    });
    await sweep(fetchImpl);
    expect(issue.state).toBe('Validating');
    expect(issue.comments.at(-1).body).toContain('malformed');
  });

  it.each(['invalid', 'JOV-1,JOV-2', ' JOV-1', 'JOV-1 ', 'LYB-1'])(
    'rejects a nonempty malformed receipt target before any external request: %s',
    async identifier => {
      let requested = false;
      await expect(
        syncLinearIssueOnMerge({
          env: {
            ...BASE_ENV,
            LIFECYCLE_MODE: 'sweep',
            LINEAR_VALIDATION_ISSUE: identifier,
          },
          fetchImpl: async () => {
            requested = true;
            throw new Error('Unexpected external request');
          },
          log: () => {},
        })
      ).rejects.toThrow(/Malformed LINEAR_VALIDATION_ISSUE/);
      expect(requested).toBe(false);
    }
  );

  it.each(['success', 'rate-limit'])(
    'preserves an explicitly supplied full-sweep cursor after a targeted receipt: %s',
    async outcome => {
      const { world, fetchImpl } = createWorld();
      const cursorDir = mkdtempSync(join(tmpdir(), 'linear-target-cursor-'));
      const original = `${JSON.stringify({
        schema: 1,
        nextIdentifier: 'JOV-99',
        savedAt: '2026-10-03T12:00:00Z',
      })}\n`;
      writeFileSync(join(cursorDir, 'cursor.json'), original);
      const limited = intercept(fetchImpl, async (_url, body) =>
        outcome === 'rate-limit' &&
        body?.query?.includes('query IssueLifecycle(')
          ? {
              ok: false,
              status: 400,
              headers: { get: () => null },
              json: async () => ({
                errors: [
                  {
                    message: 'Rate limit exceeded',
                    extensions: { code: 'RATELIMITED' },
                  },
                ],
              }),
            }
          : null
      );
      try {
        const result = await syncLinearIssueOnMerge({
          env: {
            ...BASE_ENV,
            LIFECYCLE_MODE: 'sweep',
            LINEAR_VALIDATION_ISSUE: 'JOV-1',
            LINEAR_SYNC_CURSOR_DIR: cursorDir,
          },
          fetchImpl: limited,
          harnessManifest: HARNESS_MANIFEST,
          assuranceMatrix: NO_UI_MATRIX,
          verifyMarker: () => true,
          sleep: async () => {},
          log: () => {},
        });
        if (outcome === 'rate-limit') {
          expect(result.action).toBe('deferred');
          expect(world.updates).toEqual([]);
        } else {
          expect(world.issues['JOV-1'].state).toBe('Done');
        }
        expect(readFileSync(join(cursorDir, 'cursor.json'), 'utf8')).toBe(
          original
        );
      } finally {
        rmSync(cursorDir, { recursive: true, force: true });
      }
    }
  );

  it.each([undefined, ''])(
    'preserves the existing global sweep when the receipt target is absent: %s',
    async identifier => {
      const { fetchImpl } = createWorld();
      let scanned = false;
      const observed = intercept(fetchImpl, (_url, body) => {
        if (body?.query?.includes('LifecycleSweep')) scanned = true;
        return null;
      });
      await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          LIFECYCLE_MODE: 'sweep',
          LINEAR_VALIDATION_ISSUE: identifier,
        },
        fetchImpl: observed,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        log: () => {},
      });
      expect(scanned).toBe(true);
    }
  );

  it.each(['JOV-1', 'jov-1'])(
    'targets a parent-only commissioning receipt and preserves its proof across unrelated forward generations: %s',
    async identifier => {
      const { world, fetchImpl } = createWorld({ served: MAIN[4].slice(0, 7) });
      const issue = world.issues['JOV-1'];
      Object.assign(issue, {
        title: 'Commission the paid merch loop',
        state: 'In Progress',
        attachments: [],
      });
      issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
      const exact = intercept(fetchImpl, (_url, body) => {
        if (body?.query?.includes('LifecycleSweep'))
          throw new Error('receipt should target its exact issue');
        return null;
      });
      await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          LIFECYCLE_MODE: 'sweep',
          LINEAR_VALIDATION_ISSUE: identifier,
        },
        fetchImpl: exact,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        log: () => {},
      });
      expect(issue.state).toBe('Done');
      expect(issue.comments.at(-1).body).toContain(MAIN[2]);
    }
  );
  it('does not reuse an earlier episode receipt and converges after fresh proof', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.history = [
      {
        createdAt: '2026-10-03T14:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
      {
        createdAt: '2026-10-03T12:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
    ];
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
    await sweep(fetchImpl);
    expect(issue.state).toBe('Validating');
    expect(world.updates).toEqual([]);
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
    await sweep(fetchImpl);
    await sweep(fetchImpl);
    expect(issue.state).toBe('Done');
    expect(world.updates).toEqual(['JOV-1:Done']);
  });

  it('cannot close a reopened episode when its server timestamp is unreadable', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.history = [
      { fromState: { type: 'completed' }, toState: { type: 'started' } },
    ];
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
    await sweep(fetchImpl);
    expect(issue.state).toBe('Validating');
    expect(world.updates).toEqual([]);
    expect(issue.comments.at(-1).body).toMatch(/episode.*unknown/i);
  });

  it('does not reuse an escaped-defect closure from before the current episode', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.labels = ['escaped-defect'];
    issue.history = [
      {
        createdAt: '2026-10-03T14:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
    ];
    issue.description = validClosure('JOV-1', MAIN[2]);
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
    await sweep(fetchImpl);
    expect(issue.state).toBe('Validating');
    expect(world.updates).toEqual([]);
    issue.comments.push({
      body: validClosure('JOV-1', MAIN[2]),
      createdAt: '2026-10-03T15:01:00Z',
    });
    await sweep(fetchImpl);
    expect(issue.state).toBe('Done');
    expect(world.updates).toEqual(['JOV-1:Done']);
  });

  it('reads a later history page before deciding which receipt belongs to this episode', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
    const paged = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycleHistory')) {
        expect(body.query).toContain('createdAt');
        expect(body.variables.after).toBe('h1');
        return json({
          data: {
            issue: {
              history: {
                nodes: [
                  {
                    createdAt: '2026-10-03T14:00:00Z',
                    fromState: { type: 'completed' },
                    toState: { type: 'started' },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      }
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      expect(body.query).toContain('createdAt fromState');
      const response = await (await next()).json();
      response.data.issue.history = {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: 'h1' },
      };
      return json(response);
    });
    await sweep(paged);
    expect(issue.state).toBe('Validating');
    expect(world.updates).toEqual([]);
  });

  it.each([
    null,
    {},
    { nodes: [] },
    { nodes: [], pageInfo: { hasNextPage: true } },
  ])('fails closed on incomplete history %j', async history => {
    const { world, fetchImpl } = createWorld();
    const incomplete = intercept(fetchImpl, async (_url, body, next) => {
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      const response = await (await next()).json();
      response.data.issue.history = history;
      return json(response);
    });
    await expect(mergeEvent(incomplete, 101)).rejects.toThrow(
      /history.*JOV-1/i
    );
    expect(world.updates).toEqual([]);
  });

  it('bounds a non-terminating history read without changing state', async () => {
    const { world, fetchImpl } = createWorld();
    let pages = 0;
    const endless = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycleHistory')) {
        pages += 1;
        return json({
          data: {
            issue: {
              history: {
                nodes: [],
                pageInfo: { hasNextPage: true, endCursor: `h${pages}` },
              },
            },
          },
        });
      }
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      const response = await (await next()).json();
      response.data.issue.history.pageInfo = {
        hasNextPage: true,
        endCursor: 'h0',
      };
      return json(response);
    });
    await expect(mergeEvent(endless, 101)).rejects.toThrow(
      /history.*exceeds the read bound/
    );
    expect(pages).toBe(10);
    expect(world.updates).toEqual([]);
  });

  it('enters the validation lifecycle for a Summer-bound bot merge', async () => {
    const body = '<!-- summer-issue-bind -->\nJOV-1\ntaskKey:abc';
    expect(
      extractMergeIssueRef({
        body,
        headRef: 'bot/coverage-audit-37652202419-1',
      })
    ).toEqual({ identifier: 'JOV-1', issueId: 'JOV-1' });
    expect(
      pullRequestLinksIssue(
        { body, title: 'Coverage report', headRef: 'bot/report' },
        { identifier: 'JOV-1', issueId: 'uuid-1' }
      )
    ).toBe(true);
    expect(
      extractMergeIssueRef({ body: 'Related: JOV-1', headRef: 'bot/report' })
    ).toEqual({ identifier: '', issueId: '' });
    expect(
      extractMergeIssueRef({
        body: '<!-- summer-issue-bind -->\nJOV-12',
        headRef: 'bot/report',
      })
    ).toEqual({ identifier: 'JOV-12', issueId: 'JOV-12' });
    const { world, fetchImpl } = createWorld();
    const result = await mergeEvent(fetchImpl, 101, 'JOV-1', { PR_BODY: body });
    expect(result.identifier).toBe('JOV-1');
    expect(world.updates.length).toBeGreaterThan(0);
  });
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

  it('holds JOV-6586 while later stack layers are open, ignoring the merging PR', () => {
    const issue = JOV_6586_ISSUE;
    const held = lifecycleHolds({
      issue,
      pullRequests: JOV_6586_STACK,
      mergingNumber: MERGING_FOUNDATION.number,
    });
    expect(held.blockingNumbers).toEqual([18277, 18286, 18293]);
    expect(held.holds[0]).toContain('#18293 (draft)');
    expect(
      lifecycleHolds({
        issue: { ...issue, labels: ['remediation:golden-path-nightly'] },
        pullRequests: [],
        scanComplete: false,
      }).holds.join('\n')
    ).toMatch(/stopped before the last page[\s\S]*while the check is red/);
  });

  it('keeps commissioning parents as outcome acceptance, not a merge hold', () => {
    expect(COMMISSIONING_PARENT_ALLOWLIST.has('JOV-5853')).toBe(true);
    expect(COMMISSIONING_PARENT_ALLOWLIST.has('JOV-6004')).toBe(true);
    expect(parentHoldReason({ identifier: 'JOV-5853' })).toContain('allowlist');
    expect(
      parentHoldReason(
        { identifier: 'JOV-7000', labels: ['commissioning'] },
        new Set()
      )
    ).toContain('label commissioning');
  });

  it('moves a merge to Merging, then Done after the deploy sweep', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    expect((await mergeEvent(fetchImpl, 101)).action).toBe('moved');
    expect(world.issues['JOV-1'].state).toBe('Merging');
    world.served = MAIN[2].slice(0, 7);
    let pages = 0;
    const paged = intercept(fetchImpl, async (_url, body, next) => {
      if (!body?.query?.includes('LifecycleSweep')) return null;
      pages += 1;
      if (pages > 1) return next();
      return json({
        data: {
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: 'p1' },
          },
        },
      });
    });
    await sweep(paged);
    expect(pages).toBe(2);
    expect(world.updates).toEqual(['JOV-1:Merging', 'JOV-1:Done']);
  });

  it('recovers a missed merge from In Progress while preserving unmerged and unlinked writers', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    world.issues['JOV-1'].state = 'In Progress';
    world.issues['JOV-2'] = {
      ...world.issues['JOV-1'],
      id: 'uuid-2',
      identifier: 'JOV-2',
      attachments: [],
    };
    world.issues['JOV-3'] = {
      ...world.issues['JOV-1'],
      id: 'uuid-3',
      identifier: 'JOV-3',
      attachments: ['https://github.com/JovieInc/Jovie/pull/102'],
    };
    world.pulls[102] = {
      ...world.pulls[101],
      mergedAt: null,
      headRef: 'codex/jov-3-active',
    };
    await sweep(fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Merging');
    expect(world.issues['JOV-2'].state).toBe('In Progress');
    expect(world.issues['JOV-3'].state).toBe('In Progress');
    expect(world.updates).toEqual(['JOV-1:Merging']);
  });

  it('moves the real escaped-defect merge path to Validating and never Done', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].labels = ['escaped-defect'];
    await mergeEvent(fetchImpl, 101);
    await sweep(fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.updates).toEqual(['JOV-1:Validating']);
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'escaped-defect-dual-closure'
    );
  });

  it('reads every comment page, bounded, so the latest receipt wins', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].description = 'validation-required: outcome';
    world.issues['JOV-1'].comments.push(
      receiptComment('JOV-1', { status: 'fail' }, '2026-10-03T11:00:00Z'),
      receiptComment('JOV-1', {}, '2026-10-03T11:30:00Z')
    );
    const page = (nodes, hasNextPage) => ({
      nodes,
      pageInfo: { hasNextPage, endCursor: 'c' },
    });
    const paged = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycleComments')) {
        return json({
          data: {
            issue: {
              comments: page(world.issues['JOV-1'].comments.slice(1), false),
            },
          },
        });
      }
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      const response = await (await next()).json();
      response.data.issue.comments = page(
        response.data.issue.comments.nodes.slice(0, 1),
        true
      );
      return json(response);
    });
    await mergeEvent(paged, 101);
    expect(world.issues['JOV-1'].state).toBe('Done');

    world.issues['JOV-1'].state = 'Validating';
    const endless = intercept(paged, async (_url, body) =>
      body?.query?.includes('IssueLifecycleComments')
        ? json({ data: { issue: { comments: page([], true) } } })
        : null
    );
    await expect(mergeEvent(endless, 101)).rejects.toThrow(
      /exceeds the read bound/
    );
  });

  it('holds a parent with open sub-issues and a reopened issue needs an outcome', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].children = [['JOV-2', 'started']];
    expect((await mergeEvent(fetchImpl, 101)).action).toBe('hold');
    world.issues['JOV-1'].children = [['JOV-2', 'completed']];
    world.issues['JOV-1'].history = [
      {
        createdAt: '2026-10-03T11:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
    ];
    await mergeEvent(fetchImpl, 101);
    expect(world.issues['JOV-1'].state).toBe('Validating');
  });

  it('isolates a failing issue in the sweep and still evaluates the rest', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      attachments: [`https://github.com/${REPO}/pull/999`],
    };
    await expect(sweep(fetchImpl)).rejects.toThrow(/JOV-2: GitHub HTTP 404/);
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('comments and fails closed when the open pull request scan errors', async () => {
    const { world, fetchImpl } = createWorld();
    const failing = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? { ok: false, status: 503, json: async () => ({}) }
        : null
    );
    await expect(mergeEvent(failing, 101)).rejects.toThrow(
      /open pull request scan failed/
    );
    expect(world.updates).toEqual([]);
    expect(world.issues['JOV-1'].comments[0].body).toContain(
      'stopped before the last page'
    );
  });

  it('fails a sweep on a scan error and keeps per-issue failures in the message', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-1'].attachments = [`https://github.com/${REPO}/pull/999`];
    const failing = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? { ok: false, status: 503, json: async () => ({}) }
        : null
    );
    await expect(sweep(failing)).rejects.toThrow(
      /open pull request scan failed, so issues were left in place; JOV-1: GitHub HTTP 404/
    );
    expect(world.updates).toEqual([]);
  });

  it('stops a sweep at the Linear rate limit, oldest issue first, and persists the resume cursor', async () => {
    const { world, fetchImpl } = createWorld();
    const cursorDir = mkdtempSync(join(tmpdir(), 'linear-sync-cursor-'));
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-1'].updatedAt = '2026-10-03T13:00:00Z';
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      updatedAt: '2026-10-03T09:00:00Z',
    };
    world.pulls[303] = {
      mergeSha: MAIN[1],
      mergedAt: '2026-10-03T10:00:00Z',
      files: ['apps/web/components/Card.tsx'],
      headRef: 'tim/jov-3-editorial-card',
    };
    world.issues['JOV-3'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-3',
      identifier: 'JOV-3',
      updatedAt: '2026-10-03T15:00:00Z',
      attachments: [`https://github.com/${REPO}/pull/303`],
    };
    const asked = [];
    const limited = intercept(fetchImpl, async (_url, body) => {
      if (!body?.query?.includes('LifecycleIssueBatch')) return null;
      asked.push(body.variables.id0);
      return {
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({
          errors: [
            {
              message: 'Rate limit exceeded',
              extensions: { code: 'RATELIMITED' },
            },
          ],
        }),
      };
    });
    try {
      const first = await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          LIFECYCLE_MODE: 'sweep',
          LINEAR_SYNC_CURSOR_DIR: cursorDir,
        },
        fetchImpl: limited,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        sleep: async () => {},
        log: () => {},
      });
      expect(first.action).toBe('deferred');
      expect(first.deferred).toBe(3);
      expect(asked.every(id => id === 'JOV-2')).toBe(true);
      expect(asked.length).toBeGreaterThan(1);
      expect(
        JSON.parse(readFileSync(join(cursorDir, 'cursor.json'), 'utf8'))
          .nextIdentifier
      ).toBe('JOV-2');
      expect(world.updates).toEqual([]);

      writeFileSync(
        join(cursorDir, 'cursor.json'),
        `${JSON.stringify({
          schema: 1,
          nextIdentifier: 'JOV-1',
          savedAt: '2026-10-15T00:00:00.000Z',
        })}\n`
      );
      const resumed = [];
      const healthy = intercept(fetchImpl, async (_url, body) => {
        if (!body?.query?.includes('LifecycleIssueBatch')) return null;
        resumed.push(body.variables.id0);
        return null;
      });
      await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          LIFECYCLE_MODE: 'sweep',
          LINEAR_SYNC_CURSOR_DIR: cursorDir,
        },
        fetchImpl: healthy,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        sleep: async () => {},
        log: () => {},
      });
      expect(resumed[0]).toBe('JOV-1');
      expect(world.issues['JOV-2'].state).toBe('Merging');
      expect(world.issues['JOV-1'].state).toBe('Done');
      expect(world.issues['JOV-3'].state).toBe('Done');
      expect(
        JSON.parse(readFileSync(join(cursorDir, 'cursor.json'), 'utf8'))
          .nextIdentifier
      ).toBe('');
    } finally {
      rmSync(cursorDir, { recursive: true, force: true });
    }
  });

  it('skips one unreadable pull request and still closes the other issue', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      updatedAt: '2026-10-03T09:00:00Z',
      attachments: [`https://github.com/${REPO}/pull/19767`],
    };
    const blocked = intercept(fetchImpl, async url =>
      url.includes('/pulls/19767')
        ? {
            ok: false,
            status: 403,
            headers: new Headers({ 'x-ratelimit-remaining': '4000' }),
            json: async () => ({
              message: 'Resource not accessible by integration',
            }),
          }
        : null
    );
    const logs = [];
    await syncLinearIssueOnMerge({
      env: { ...BASE_ENV, LIFECYCLE_MODE: 'sweep' },
      fetchImpl: blocked,
      harnessManifest: HARNESS_MANIFEST,
      assuranceMatrix: NO_UI_MATRIX,
      verifyMarker: () => true,
      log: message => logs.push(message),
    });
    expect(world.issues['JOV-1'].state).toBe('Done');
    expect(world.issues['JOV-2'].state).toBe('Merging');
    expect(logs.join('\n')).toContain('pulls/19767');
    expect(logs.join('\n')).not.toContain('token permission gap');
  });

  it('defers a quota 403 on one linked pull and resumes after it', async () => {
    const { world, fetchImpl } = createWorld();
    const cursorDir = mkdtempSync(join(tmpdir(), 'linear-sync-cursor-'));
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      updatedAt: '2026-10-03T09:00:00Z',
      attachments: [`https://github.com/${REPO}/pull/19767`],
    };
    const exhausted = intercept(fetchImpl, async url =>
      url.includes('/pulls/19767')
        ? {
            ok: false,
            status: 403,
            headers: new Headers({ 'x-ratelimit-remaining': '0' }),
            json: async () => ({
              message: 'API rate limit exceeded for installation.',
            }),
          }
        : null
    );
    try {
      const logs = [];
      const first = await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          LIFECYCLE_MODE: 'sweep',
          LINEAR_SYNC_CURSOR_DIR: cursorDir,
        },
        fetchImpl: exhausted,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        sleep: async () => {},
        log: message => logs.push(message),
      });
      expect(first.action).toBe('deferred');
      expect(first.deferred).toBe(2);
      expect(world.issues['JOV-1'].state).toBe('Merging');
      expect(world.issues['JOV-2'].state).toBe('Merging');
      expect(logs.join('\n')).toContain('pulls/19767');
      expect(logs.join('\n')).toContain('GitHub rate limit');
      expect(logs.join('\n')).not.toContain('token permission gap');
      expect(
        JSON.parse(readFileSync(join(cursorDir, 'cursor.json'), 'utf8'))
          .nextIdentifier
      ).toBe('JOV-2');
    } finally {
      rmSync(cursorDir, { recursive: true, force: true });
    }
  });

  it('defers a quota-exhausted open scan without holding every issue', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    const exhausted = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? {
            ok: false,
            status: 403,
            headers: new Headers({ 'x-ratelimit-remaining': '0' }),
            json: async () => ({
              message: 'API rate limit exceeded for installation.',
            }),
          }
        : null
    );
    const result = await syncLinearIssueOnMerge({
      env: { ...BASE_ENV, LIFECYCLE_MODE: 'sweep' },
      fetchImpl: exhausted,
      harnessManifest: HARNESS_MANIFEST,
      assuranceMatrix: NO_UI_MATRIX,
      verifyMarker: () => true,
      sleep: async () => {},
      log: () => {},
    });
    expect(result.action).toBe('deferred');
    expect(world.updates).toEqual([]);
    expect(world.issues['JOV-1'].state).toBe('Merging');
  });

  it('fails a merge event closed when the open scan is quota exhausted', async () => {
    const { world, fetchImpl } = createWorld();
    const exhausted = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? {
            ok: false,
            status: 403,
            headers: new Headers({ 'x-ratelimit-remaining': '0' }),
            json: async () => ({
              message: 'API rate limit exceeded for installation.',
            }),
          }
        : null
    );
    await expect(mergeEvent(exhausted, 101)).rejects.toThrow(
      /open pull request scan failed/
    );
    expect(world.updates).toEqual([]);
  });

  it('reports an open-scan 403 that is not a rate limit as a token permission gap', async () => {
    const { fetchImpl } = createWorld();
    const denied = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? {
            ok: false,
            status: 403,
            headers: new Headers({ 'x-ratelimit-remaining': '4000' }),
            json: async () => ({
              message: 'Resource not accessible by integration',
            }),
          }
        : null
    );
    await expect(
      syncLinearIssueOnMerge({
        env: { ...BASE_ENV, LIFECYCLE_MODE: 'sweep' },
        fetchImpl: denied,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        log: () => {},
      })
    ).rejects.toThrow(/token permission gap/);
  });

  it('surfaces Linear HTTP and GraphQL errors, and skips unknown issues', async () => {
    for (const [response, error] of [
      [{ ok: false, status: 500, json: async () => ({}) }, /Linear HTTP 500/],
      [
        {
          ok: false,
          status: 400,
          json: async () => ({ errors: [{ message: 'Query too complex' }] }),
        },
        /Linear HTTP 400: Query too complex/,
      ],
      [
        json({ errors: [{ message: 'rate limited' }, 'x'] }),
        /rate limited; Linear request failed/,
      ],
    ]) {
      const { fetchImpl } = createWorld();
      const failing = intercept(fetchImpl, async (_url, body) =>
        body?.query?.includes('IssueLifecycle(') ? response : null
      );
      await expect(mergeEvent(failing, 101)).rejects.toThrow(error);
    }
    const { fetchImpl } = createWorld();
    expect((await mergeEvent(fetchImpl, 101, 'JOV-404')).action).toBe('skip');
  });

  it('skips without a marker or Linear key and requires GitHub credentials', async () => {
    const { fetchImpl } = createWorld();
    const run = env =>
      syncLinearIssueOnMerge({ env, fetchImpl, log: () => {} });
    expect(
      (await run({ ...BASE_ENV, PR_BODY: '', HEAD_REF: 'x' })).action
    ).toBe('skip');
    const marker = { PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->' };
    expect((await run(marker)).action).toBe('skip');
    await expect(run({ ...marker, LINEAR_API_KEY: 'k' })).rejects.toThrow(
      /GITHUB_TOKEN are required/
    );
  });

  it('loads the harness manifest and assurance matrix from the workspace; missing ones are unknown', async () => {
    const repoRoot = resolve(import.meta.dirname, '../../..');
    /** @type {[string, string[], string, string][]} */
    const cases = [
      [repoRoot, ['docs/README.md'], 'Done', ''],
      [
        repoRoot,
        ['apps/web/components/atoms/RailToggleButton.tsx'],
        'Validating',
        'screen-audit',
      ],
      [
        '/nonexistent-workspace',
        ['docs/README.md'],
        'Validating',
        'human-certification',
      ],
    ];
    for (const [workspace, files, expected, missing] of cases) {
      const { world, fetchImpl } = createWorld();
      world.pulls[101].files = files;
      await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          GITHUB_WORKSPACE: workspace,
          LIFECYCLE_DRY_RUN: '',
          PR_NUMBER: '101',
          PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->',
        },
        fetchImpl,
        verifyMarker: () => true,
        log: () => {},
      });
      expect(world.issues['JOV-1'].state).toBe(expected);
      if (missing) {
        expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
          `Next missing receipt: ${missing}.`
        );
      }
    }
  });

  it('follows GitHub pagination and reports an incomplete scan', async () => {
    const listed = await listOpenPullRequests({
      token: 'gh_test',
      repository: REPO,
      maxPages: 1,
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => '<https://api.github.com/x?page=2>; rel="next"' },
        json: async () => [{ number: 18293, state: 'open', draft: true }],
      }),
    });
    expect(listed.complete).toBe(false);
    expect(listed.pulls[0].draft).toBe(true);
  });

  it('records an owner receipt through the CLI and refuses what it cannot record', async () => {
    const args = [
      '--issue',
      'JOV-1',
      '--kind',
      'outcome',
      '--status',
      'pass',
      '--sha',
      MAIN[2],
      '--evidence',
      'https://example.test/outcome/1',
    ];
    const respond = data => async () => json({ data });
    const env = { LINEAR_API_KEY: 'k' };
    const body = await recordValidationReceipt(args, {
      env,
      fetchImpl: respond({
        issue: { id: 'uuid-1' },
        commentCreate: { success: true },
      }),
    });
    expect(body).toContain('validation-receipt:v1');
    await expect(recordValidationReceipt(args, { env: {} })).rejects.toThrow(
      /LINEAR_API_KEY is required/
    );
    await expect(
      recordValidationReceipt(args, {
        env,
        fetchImpl: respond({ issue: null }),
      })
    ).rejects.toThrow(/Could not resolve JOV-1/);
    await expect(
      recordValidationReceipt(args, {
        env,
        fetchImpl: respond({
          issue: { id: 'uuid-1' },
          commentCreate: { success: false },
        }),
      })
    ).rejects.toThrow(/refused the validation receipt/);
    await expect(
      recordValidationReceipt(['--issue', 'JOV-1'], { env })
    ).rejects.toThrow(/kind must be/);
  });

  it.each(['null', '2026-10-03T08:00:00-04:00'])(
    'records an explicit CLI acceptance episode %s',
    async episode => {
      const body = await recordValidationReceipt(
        [
          '--issue',
          'JOV-1',
          '--kind',
          'outcome',
          '--status',
          'fail',
          '--sha',
          MAIN[2],
          '--evidence',
          'https://example.test/event/1',
          '--episode-started-at',
          episode,
        ],
        {
          env: { LINEAR_API_KEY: 'fixture' },
          fetchImpl: async () =>
            json({
              data: {
                issue: { id: 'uuid-1' },
                commentCreate: { success: true },
              },
            }),
        }
      );
      expect(body).toContain(
        `"episodeStartedAt":${JSON.stringify(
          episode === 'null' ? null : '2026-10-03T12:00:00.000Z'
        )}`
      );
    }
  );

  it('rejects a malformed CLI episode before any external request', async () => {
    let requested = false;
    await expect(
      recordValidationReceipt(
        [
          '--issue',
          'JOV-1',
          '--kind',
          'outcome',
          '--status',
          'pass',
          '--sha',
          MAIN[2],
          '--evidence',
          'https://example.test/event/1',
          '--episode-started-at',
          'bad',
        ],
        {
          env: { LINEAR_API_KEY: 'fixture' },
          fetchImpl: async () => {
            requested = true;
            return json({ data: {} });
          },
        }
      )
    ).rejects.toThrow(/episode/);
    expect(requested).toBe(false);
  });

  it('wakes the existing writer on both maintained producer completions', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/linear-sync-on-merge.yml'
      ),
      'utf8'
    );
    const completion = workflow.match(
      /^  workflow_run:\n {4}workflows: \[(.+)\]\n {4}types: \[(.+)\]/m
    );
    expect(completion?.[1].split(',').map(name => name.trim())).toEqual([
      'Production Controller',
      'Sentry Autofix Recurrence',
    ]);
    expect(completion?.[2]).toBe('completed');
    const recurrence = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/sentry-autofix-recurrence.yml'
      ),
      'utf8'
    );
    expect(recurrence.match(/^name: (.+)$/m)?.[1]).toBe(
      'Sentry Autofix Recurrence'
    );
    // Completion wakes a fresh read; it never asserts an outcome or creates a clock.
    expect(workflow).not.toMatch(/^\s+schedule:/m);
    expect(workflow).toContain(
      "LIFECYCLE_MODE: ${{ github.event_name == 'pull_request' && 'merge' || 'sweep' }}"
    );
    expect(workflow).toContain(
      'run: node scripts/lib/linear-sync-on-merge.mjs'
    );
    expect(workflow).not.toContain('github.event.workflow_run.conclusion');
  });

  it('keeps targeted receipt jobs from restoring or replacing the full-sweep cursor', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/linear-sync-on-merge.yml'
      ),
      'utf8'
    );
    const cursor = workflow.match(/^\s+LINEAR_SYNC_CURSOR_DIR: (.+)$/m)?.[1];
    const restore = workflow
      .split('- name: Restore sweep cursor')[1]
      .match(/^\s+if: (.+)$/m)?.[1];
    const save = workflow
      .split('- name: Save sweep cursor')[1]
      .match(/^\s+if: (.+)$/m)?.[1];
    const saveCache = workflow
      .split('- name: Save immutable GitHub reads')[1]
      .match(/^\s+if: (.+)$/m)?.[1];
    expect(cursor).toMatch(/^\$\{\{/);
    const evaluate = (expression, eventName, event = {}) =>
      runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
        github: { event_name: eventName, event },
        cancelled: () => false,
        hashFiles: () => 'existing-full-sweep-cursor',
        steps: {
          evaluate: { outputs: { github_cache_key: 'immutable-cache' } },
        },
      });
    for (const identifier of ['JOV-8416', 'JOV-8430']) {
      const event = { client_payload: { issue_identifier: identifier } };
      expect(evaluate(cursor, 'repository_dispatch', event)).toBe('');
      expect(evaluate(restore, 'repository_dispatch', event)).toBe(false);
      expect(evaluate(save, 'repository_dispatch', event)).toBe(false);
      expect(evaluate(saveCache, 'repository_dispatch', event)).toBe(false);
    }
    for (const eventName of ['workflow_run', 'workflow_dispatch']) {
      expect(evaluate(cursor, eventName)).toBe('.linear-sync-cursor');
      expect(evaluate(restore, eventName)).toBe(true);
      expect(evaluate(save, eventName)).toBe(true);
      expect(evaluate(saveCache, eventName)).toBe(true);
    }
    const untargeted = { client_payload: {} };
    expect(evaluate(cursor, 'repository_dispatch', untargeted)).toBe(
      '.linear-sync-cursor'
    );
    expect(evaluate(restore, 'repository_dispatch', untargeted)).toBe(true);
    expect(evaluate(save, 'repository_dispatch', untargeted)).toBe(true);
    expect(evaluate(saveCache, 'repository_dispatch', untargeted)).toBe(true);
    expect(evaluate(restore, 'pull_request')).toBe(false);
    expect(evaluate(save, 'pull_request')).toBe(false);
    expect(evaluate(saveCache, 'pull_request')).toBe(false);
  });

  it('keeps distinct receipt wakeups out of the full-sweep pending slot', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/linear-sync-on-merge.yml'
      ),
      'utf8'
    );
    const group = workflow.match(/^\s+group: (.+)$/m)?.[1];
    expect(group).toBeDefined();
    const groupFor = (eventName, event = {}) =>
      group.replace(/\$\{\{(.*?)\}\}/g, (_match, expression) =>
        String(
          runInNewContext(expression, {
            github: { event_name: eventName, event },
            format: (pattern, value) => pattern.replace('{0}', String(value)),
          })
        )
      );
    const receiptEvent = identifier => ({
      client_payload: { issue_identifier: identifier },
    });
    const first = groupFor('repository_dispatch', receiptEvent('JOV-8416'));
    const second = groupFor('repository_dispatch', receiptEvent('JOV-8430'));
    expect(first).toBe('linear-validation-lifecycle-receipt-JOV-8416');
    expect(second).toBe('linear-validation-lifecycle-receipt-JOV-8430');
    expect(first).not.toBe(second);
    // Same-issue replacement is safe: the writer re-reads all its receipts.
    expect(groupFor('repository_dispatch', receiptEvent('JOV-8416'))).toBe(
      first
    );
    for (const event of ['workflow_run', 'workflow_dispatch']) {
      expect(groupFor(event, receiptEvent('JOV-8416'))).toBe(
        'linear-validation-lifecycle-sweep'
      );
    }
    expect(groupFor('repository_dispatch', receiptEvent(''))).toBe(
      'linear-validation-lifecycle-sweep'
    );
    for (const number of [1, 2]) {
      expect(groupFor('pull_request', { pull_request: { number } })).toBe(
        `linear-validation-lifecycle-${number}`
      );
    }
    expect(workflow).toMatch(/cancel-in-progress: false/);
  });

  it('delegates every lifecycle event to the script with its dependencies', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/linear-sync-on-merge.yml'
      ),
      'utf8'
    );
    expect(workflow).toContain('node scripts/lib/linear-sync-on-merge.mjs');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('issueUpdate');
    // Receipts arrive through the Linear webhook bridge; no clock.
    expect(workflow).not.toMatch(/^\s+schedule:/m);
    for (const trigger of [
      'pull_request:',
      'workflow_run:',
      'repository_dispatch:',
      'linear_validation_receipt',
      'workflow_dispatch:',
      'Production Controller',
      'actions: read',
      '.github/ci-harness/manifest.json',
      'LINEAR_SYNC_CURSOR_DIR',
    ]) {
      expect(workflow).toContain(trigger);
    }
    const modules = ['linear-sync-on-merge.mjs', 'validation-sync.mjs'].map(
      name => readFileSync(resolve(import.meta.dirname, '..', name), 'utf8')
    );
    for (const script of modules) {
      for (const match of script.matchAll(
        /(?:from '|import\(')\.\/([a-z0-9-]+\.mjs)'/g
      )) {
        expect(workflow).toContain(`scripts/lib/${match[1]}`);
      }
    }
  });
});

// The file list from pull_request runs whose workflow ref predates the
// quota module (run 38824244848). Those runs still check out main.
const IN_FLIGHT_MERGE_SPARSE = [
  '.nvmrc',
  '.github/ci-harness/manifest.json',
  '.github/scripts/production-marker-state.mjs',
  'scripts/lib/linear-sync-on-merge.mjs',
  'scripts/lib/validation-lifecycle.mjs',
  'scripts/lib/validation-sync.mjs',
  'scripts/lib/escaped-defect-closure.mjs',
  'scripts/lib/founder-taste-order.mjs',
  'scripts/lib/ci-harness.mjs',
  'scripts/lib/remediation-signal.mjs',
  'scripts/lib/deprecation-observation.mjs',
  'scripts/lib/linear-issue-intake.mjs',
  'scripts/lib/linear-cooldown.mjs',
  'scripts/invariants/assurance-matrix.mjs',
  'scripts/invariants/assurance-matrix.json',
];

it('classifies installation 403s when the quota module is in the checkout', () => {
  expect(installationQuotaClassifierReady).toBe(true);
  expect(
    isInstallationQuota403('API rate limit exceeded for installation ID 9')
  ).toBe(true);
  expect(isInstallationQuota403('Resource not accessible by integration')).toBe(
    false
  );
  expect(
    failureDisposition(
      'Linear Sync',
      new Error('API rate limit exceeded for installation ID 9')
    ).softFailed
  ).toBe(true);
});

it('keeps installation 403s fatal when an in-flight sparse checkout omits the quota module', () => {
  const repository = resolve(import.meta.dirname, '../../..');
  const root = mkdtempSync(join(tmpdir(), 'linear-sync-old-sparse-'));
  try {
    for (const path of IN_FLIGHT_MERGE_SPARSE) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(repository, path), target);
    }
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `globalThis.fetch = () => { throw new Error('unexpected network call'); };
         const entry = await import(process.argv[1]);
         const sentence = 'API rate limit exceeded for installation ID 1';
         if (entry.installationQuotaClassifierReady !== false) process.exit(2);
         if (entry.isInstallationQuota403(sentence) !== false) process.exit(3);
         const disposition = entry.failureDisposition('Linear Sync', new Error(sentence));
         if (disposition.softFailed !== false || disposition.code !== 1) process.exit(4);
         if (typeof entry.syncLinearIssueOnMerge !== 'function') process.exit(5);`,
        pathToFileURL(join(root, 'scripts/lib/linear-sync-on-merge.mjs')).href,
      ],
      { cwd: root, encoding: 'utf8', env: {}, timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stderr).toContain(
      'github-installation-quota.mjs is absent from this sparse checkout'
    );
    expect(result.stderr).toContain('Installation 403s stay fatal');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('loads every transitive dependency from the workflow sparse checkout', () => {
  const repository = resolve(import.meta.dirname, '../../..');
  const workflow = readFileSync(
    join(repository, '.github/workflows/linear-sync-on-merge.yml'),
    'utf8'
  );
  const sparse = workflow.match(/sparse-checkout: \|\n((?: {12}.+\n)+)/);
  if (!sparse) throw new Error('workflow must declare its sparse checkout');
  const paths = sparse[1]
    .trim()
    .split('\n')
    .map(path => path.trim());
  const root = mkdtempSync(join(tmpdir(), 'linear-sync-checkout-'));
  try {
    for (const path of paths) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(repository, path), target);
    }
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `globalThis.fetch = () => { throw new Error('unexpected network call'); };
         const entry = await import(process.argv[1]);
         if (typeof entry.syncLinearIssueOnMerge !== 'function') process.exit(1);
         if (entry.installationQuotaClassifierReady !== true) process.exit(2);`,
        pathToFileURL(join(root, 'scripts/lib/linear-sync-on-merge.mjs')).href,
      ],
      { cwd: root, encoding: 'utf8', env: {}, timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('a recurring warning retains the remediation hold after a previous green observation', async () => {
  const { world, fetchImpl } = createWorld();
  const issue = world.issues['JOV-1'];
  issue.title = '[deprecation-ec4e6e5b9ffb] Resolve warning';
  issue.labels = ['remediation:deprecation-ec4e6e5b9ffb'];
  issue.comments = ['green', 'red'].map((status, index) => ({
    body: formatDeprecationObservation({
      schema: 'jovie.deprecation-observation/v1',
      issue: 'JOV-1',
      fingerprint: 'deprecation-ec4e6e5b9ffb',
      status,
      headSha: MAIN[2],
      runUrl: `https://github.com/JovieInc/Jovie/actions/runs/${123 + index}`,
      observedAt: `2026-10-07T${12 + index}:00:00Z`,
    }),
    createdAt: `2026-10-07T${12 + index}:00:00Z`,
  }));
  const result = await mergeEvent(fetchImpl, 101);
  expect(result.action).toBe('hold');
  expect(result.comment).toContain(
    'Fingerprinted remediation issues stay open'
  );
  expect(world.updates).toEqual([]);
});
