import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tryGitHubRebase } from '../github-update-branch.mjs';
import {
  createApplyConfirmation,
  createAtomicReceiptWriter,
  evaluateEligibility,
  fetchPrSnapshot,
  HOLD_LABELS,
  RECEIPT_SCHEMA,
  validateApplyEvidence,
} from '../pr-preparation-safety.mjs';

const BASE = 'a'.repeat(40);
const HEAD = '1'.repeat(40);
const hash = value => createHash('sha256').update(value).digest('hex');
const MODULE_URL = pathToFileURL(
  join(process.cwd(), 'scripts/lib/pr-preparation-safety.mjs')
).href;
const entry = overrides => ({
  number: 16001,
  expectedAuthor: 'itstimwhite',
  expectedHeadOwner: 'JovieInc',
  headRefName: 'codex/preparation-16001',
  headOid: HEAD,
  ...overrides,
});
const checks = () =>
  ['PR Ready', 'Migration Guard', 'Fork PR Gate', 'PR Size Guard'].map(
    name => ({
      __typename: 'CheckRun',
      name,
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    })
  );
const pr = overrides => ({
  number: 16001,
  title: 'feature',
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  baseRefOid: BASE,
  headRefName: entry().headRefName,
  headRefOid: HEAD,
  isCrossRepository: false,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'BEHIND',
  reviewDecision: 'APPROVED',
  author: { login: 'itstimwhite' },
  headRepositoryOwner: { login: 'JovieInc' },
  headRepository: { nameWithOwner: 'JovieInc/Jovie' },
  mergeQueueEntry: null,
  autoMergeRequest: null,
  labels: [],
  statusCheckRollup: checks(),
  ...overrides,
});
const eligibility = overrides =>
  evaluateEligibility({
    entry: entry(),
    plan: { repository: 'JovieInc/Jovie', baseRef: 'main' },
    pr: pr(overrides),
    livePolicy: { defaultBranch: 'main', sha: BASE },
  });

function page({ nodes, totalCount, hasNextPage, endCursor, metadata = false }) {
  return {
    data: {
      repository: {
        pullRequest: {
          ...(metadata ? pr() : { headRefOid: HEAD }),
          ...(metadata
            ? {
                labels: {
                  nodes: [],
                  totalCount: 0,
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              }
            : {}),
          commits: {
            nodes: [
              {
                commit: {
                  oid: HEAD,
                  statusCheckRollup: {
                    contexts: {
                      nodes,
                      totalCount,
                      pageInfo: { hasNextPage, endCursor },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  };
}

describe('reusable exact eligibility gate', () => {
  it('binds apply to the trusted controller, plan, and exact dry-run receipt', () => {
    const body = {
      schema: RECEIPT_SCHEMA,
      kind: 'item',
      mode: 'dry-run',
      outcome: 'eligible_dry_run',
      planHash: 'p'.repeat(64),
      trustedDefaultBranchSha: BASE,
      pr: 16001,
      expectedHeadOid: HEAD,
      observedHeadOid: HEAD,
      mutationAttempted: false,
      mutationApplied: false,
    };
    const receipt = {
      ...body,
      receiptSha256: hash(`${JSON.stringify(body)}\n`),
    };
    const options = {
      planHash: body.planHash,
      trustedDefaultBranchSha: BASE,
      controllerSha: BASE,
      dryRunReceipt: receipt,
      confirmation: createApplyConfirmation({
        planHash: body.planHash,
        controllerSha: BASE,
        dryRunReceiptSha256: receipt.receiptSha256,
      }),
    };
    expect(() => validateApplyEvidence(options, entry())).not.toThrow();
    for (const patch of [
      { controllerSha: 'b'.repeat(40) },
      { planHash: 'q'.repeat(64) },
      { dryRunReceipt: { ...receipt, observedHeadOid: 'c'.repeat(40) } },
    ]) {
      expect(() =>
        validateApplyEvidence({ ...options, ...patch }, entry())
      ).toThrow(/dry-run|integrity/);
    }
  });
  it('keeps canonical fast parity and excludes Graphite queue work', () => {
    expect(HOLD_LABELS).toContain('fast');
    expect(eligibility({ labels: [{ name: 'fast' }] }).outcome).toBe(
      'no_op_held'
    );
    const graphite = entry({ headRefName: 'gtmq_feature' });
    expect(
      evaluateEligibility({
        entry: graphite,
        plan: { repository: 'JovieInc/Jovie', baseRef: 'main' },
        pr: pr({ headRefName: graphite.headRefName }),
        livePolicy: { defaultBranch: 'main', sha: BASE },
      }).outcome
    ).toBe('no_op_graphite_merge_queue');
    expect(
      eligibility({ title: '[Graphite MQ] main <- feature' }).outcome
    ).toBe('no_op_graphite_merge_queue');
  });

  it.each([
    ['queue', { mergeQueueEntry: { id: 'MQE' } }],
    ['auto merge', { autoMergeRequest: { enabledAt: 'now' } }],
    ['review', { reviewDecision: 'CHANGES_REQUESTED' }],
    ['checks', { statusCheckRollup: [] }],
  ])('fails closed on current %s state', (_name, patch) => {
    expect(eligibility(patch).eligible).toBe(false);
  });
});

describe('complete GitHub snapshots', () => {
  it('paginates every check context', async () => {
    let call = 0;
    const result = await fetchPrSnapshot('JovieInc/Jovie', 16001, {
      ghJsonImpl: async () => {
        call += 1;
        if (call === 3) {
          return page({
            nodes: [],
            totalCount: 0,
            hasNextPage: false,
            endCursor: null,
            metadata: true,
          });
        }
        return call === 1
          ? page({
              nodes: Array.from({ length: 100 }, (_, index) => ({
                __typename: 'CheckRun',
                name: `check-${index}`,
                status: 'COMPLETED',
                conclusion: 'SUCCESS',
              })),
              totalCount: 101,
              hasNextPage: true,
              endCursor: 'next',
              metadata: true,
            })
          : page({
              nodes: [checks()[0]],
              totalCount: 101,
              hasNextPage: false,
              endCursor: null,
            });
      },
    });
    expect(result.statusCheckRollup).toHaveLength(101);
    expect(call).toBe(3);
  });

  it.each([
    ['queue', { mergeQueueEntry: { id: 'MQE', position: 1 } }],
    ['auto-merge', { autoMergeRequest: { enabledAt: 'now' } }],
    ['review', { reviewDecision: 'CHANGES_REQUESTED' }],
    ['hold label', { labels: [{ name: 'hold' }] }],
  ])('fails closed when final %s state changes after context pagination', async (_name, change) => {
    let call = 0;
    await expect(
      fetchPrSnapshot('JovieInc/Jovie', 16001, {
        ghJsonImpl: async () => {
          call += 1;
          const response = page({
            nodes: checks(),
            totalCount: checks().length,
            hasNextPage: false,
            endCursor: null,
            metadata: true,
          });
          if (call === 2) {
            const finalPr = response.data.repository.pullRequest;
            Object.assign(finalPr, change);
            if ('labels' in change && change.labels) {
              finalPr.labels = {
                nodes: change.labels,
                totalCount: change.labels.length,
                pageInfo: { hasNextPage: false, endCursor: null },
              };
            }
          }
          return response;
        },
      })
    ).rejects.toThrow(/state changed after statusCheckRollup pagination/);
  });

  it.each([
    ['missing cursor', null, 2, /omitted the next cursor/],
    ['short result', 'next', 3, /ended before all contexts/],
  ])('fails closed on %s', async (_name, cursor, totalCount, error) => {
    let call = 0;
    await expect(
      fetchPrSnapshot('JovieInc/Jovie', 16001, {
        ghJsonImpl: async () => {
          call += 1;
          return call === 1
            ? page({
                nodes: [checks()[0]],
                totalCount,
                hasNextPage: true,
                endCursor: cursor,
                metadata: true,
              })
            : page({
                nodes: [checks()[1]],
                totalCount,
                hasNextPage: false,
                endCursor: null,
              });
        },
      })
    ).rejects.toThrow(error);
  });
});

describe('mutation and receipt races', () => {
  it('runs the final gate after integration proof and before mutation', async () => {
    let mutations = 0;
    const snapshot = {
      ...pr(),
      id: 'PR_1',
      potentialMergeCommit: { oid: 'merge-oid' },
    };
    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: { number: 16001, headRefName: entry().headRefName },
      expectedBaseRefName: 'main',
      expectedBaseOid: BASE,
      expectedHeadOid: HEAD,
      dryRun: false,
      ghJsonImpl: async args => {
        if (args[0] === 'pr') return snapshot;
        if (String(args[1]).includes('/git/ref/heads/'))
          return { object: { sha: BASE } };
        if (String(args[1]).includes('/git/commits/'))
          return {
            sha: 'merge-oid',
            tree: { sha: 'tree-oid' },
            parents: [{ sha: BASE }, { sha: HEAD }],
          };
        mutations += 1;
        throw new Error('mutation must not run');
      },
      integrationProofImpl: async () => ({
        alreadyIntegrated: false,
        expectedIntegrationTreeOid: 'tree-oid',
        headTreeOid: 'head-tree',
      }),
      preMutationCheckImpl: async () => ({
        ok: false,
        category: 'no_op_held',
        reason: 'hold appeared',
      }),
    });
    expect('category' in result ? result.category : null).toBe('no_op_held');
    expect(mutations).toBe(0);
  });

  it('serializes a terminal receipt with unique temporary paths', async () => {
    const directory = await import('node:fs/promises').then(({ mkdtemp }) =>
      mkdtemp(join(tmpdir(), 'jovie-safety-'))
    );
    const target = join(directory, 'receipt.json');
    const temporaries = [];
    const writer = createAtomicReceiptWriter(target, {
      randomIdImpl: (() => {
        let id = 0;
        return () => `write-${++id}`;
      })(),
      beforeRenameImpl: async ({ temporary }) => temporaries.push(temporary),
    });
    await writer.write({ outcome: 'started' });
    await writer.write(
      { outcome: 'cancelled_indeterminate' },
      { terminal: true }
    );
    await writer.write({ outcome: 'updated' });
    expect(new Set(temporaries).size).toBe(2);
    expect(JSON.parse(await readFile(target, 'utf8')).outcome).toBe(
      'cancelled_indeterminate'
    );
    expect(
      (await readdir(directory)).some(name => name.includes('.tmp-'))
    ).toBe(false);
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ])('persists process-level %s cancellation', async signal => {
    const directory = await import('node:fs/promises').then(({ mkdtemp }) =>
      mkdtemp(join(tmpdir(), 'jovie-signal-'))
    );
    const target = join(directory, 'receipt.json');
    const driver = `
      const mod=await import(process.argv[1]);
      const writer=mod.createAtomicReceiptWriter(process.argv[2],{beforeRenameImpl:async({receipt})=>{if(receipt.outcome==='started'){console.log('READY');await new Promise(r=>setTimeout(r,200));}}});
      mod.installProcessSignalHandlers({getLatest:writer.getLatest,writeReceiptImpl:writer.write});
      writer.write({schema:mod.RECEIPT_SCHEMA,outcome:'started',mutationAttempted:true,mutationApplied:null,observedHeadOid:'${HEAD}',requiresExactRereadBeforeRetry:false});
      setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, [
      '--input-type=module',
      '-e',
      driver,
      MODULE_URL,
      target,
    ]);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('child not ready')),
        3000
      );
      child.stdout.on('data', chunk => {
        if (String(chunk).includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    child.kill(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({
      outcome: 'cancelled_indeterminate',
      mutationAttempted: null,
      mutationApplied: null,
      observedHeadOid: null,
      requiresExactRereadBeforeRetry: true,
    });
  });
});
