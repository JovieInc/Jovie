import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAtomicReceiptWriter,
  createPlanBundle,
  evaluateEligibility,
  fetchPrSnapshot,
  HOLD_LABELS,
  PLAN_SCHEMA,
  runPlanCommand,
  runPreparedEntry,
  validatePlan,
} from '../../pr-preparation-canary.mjs';
import { tryGitHubRebase } from '../github-update-branch.mjs';

const NOW = Date.parse('2026-08-16T19:00:00Z');
const BASE = 'a'.repeat(40);
const HEAD = '1'.repeat(40);
const MODULE_URL = pathToFileURL(
  join(process.cwd(), 'scripts/pr-preparation-canary.mjs')
).href;
const tempDirs = [];
const hash = value => createHash('sha256').update(value).digest('hex');

async function makeTemp() {
  const directory = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'jovie-pr-preparation-'))
  );
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

function entry(overrides = {}) {
  return {
    number: 16001,
    action: 'update_branch_rebase',
    expectedAuthor: 'itstimwhite',
    expectedHeadOwner: 'JovieInc',
    headRefName: 'codex/preparation-16001',
    headOid: HEAD,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    schema: PLAN_SCHEMA,
    repository: 'JovieInc/Jovie',
    baseRef: 'main',
    enabled: true,
    expiresAt: '2026-08-16T20:00:00Z',
    maxParallel: 4,
    entries: [entry()],
    ...overrides,
  };
}

function greenChecks() {
  return ['PR Ready', 'Migration Guard', 'Fork PR Gate', 'PR Size Guard'].map(
    name => ({
      __typename: 'CheckRun',
      name,
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    })
  );
}

function pullRequest(overrides = {}) {
  return {
    number: 16001,
    title: 'Safe preparation target',
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
    statusCheckRollup: greenChecks(),
    ...overrides,
  };
}

function policy(overrides = {}) {
  return { defaultBranch: 'main', sha: BASE, ...overrides };
}

async function preparedFixture() {
  const directory = await makeTemp();
  const currentPlan = plan();
  const rawPlan = `${JSON.stringify(currentPlan)}\n`;
  const planPath = join(directory, 'plan.json');
  await writeFile(planPath, rawPlan);
  const bundle = createPlanBundle({
    rawPlan,
    plan: currentPlan,
    trustedDefaultBranchSha: BASE,
    livePolicy: policy(),
    nowMs: NOW,
  });
  return { directory, currentPlan, rawPlan, planPath, bundle };
}

async function runApply({
  rebaseImpl,
  fetchPrImpl = null,
  receiptName = 'receipt.json',
}) {
  const fixture = await preparedFixture();
  const receiptPath = join(fixture.directory, receiptName);
  const result = await runPreparedEntry(
    {
      planPath: fixture.planPath,
      planHash: fixture.bundle.planHash,
      trustedDefaultBranchSha: BASE,
      mode: 'apply',
      confirmation: fixture.bundle.planHash,
      prNumber: 16001,
      receiptPath,
      runId: '1',
      runAttempt: '1',
    },
    {
      nowImpl: () => NOW,
      fetchRepositoryPolicyImpl: async () => policy(),
      fetchPrImpl: fetchPrImpl ?? (async () => pullRequest()),
      rebaseImpl,
    }
  );
  return { ...fixture, receiptPath, result };
}

describe('PR preparation eligibility parity', () => {
  it('treats every canonical queue hold, including fast, as a hard stop', () => {
    expect(HOLD_LABELS).toEqual(
      expect.arrayContaining([
        'needs-human',
        'hold',
        'gated',
        'queue-deferred',
        'needs-conflict-resolution',
        'fast',
      ])
    );
    for (const label of HOLD_LABELS) {
      const decision = evaluateEligibility({
        entry: entry(),
        plan: plan(),
        pr: pullRequest({ labels: [{ name: label }] }),
        livePolicy: policy(),
      });
      expect(decision.outcome, label).toBe('no_op_held');
    }
  });

  it('rejects Graphite merge-queue refs and titles', () => {
    const graphiteEntry = entry({ headRefName: 'gtmq_main_16001' });
    expect(
      validatePlan(plan({ entries: [graphiteEntry] }), { nowMs: NOW }).errors
    ).toContain('entries[0].headRefName cannot be a Graphite merge-queue ref');
    expect(
      evaluateEligibility({
        entry: graphiteEntry,
        plan: plan({ entries: [graphiteEntry] }),
        pr: pullRequest({ headRefName: graphiteEntry.headRefName }),
        livePolicy: policy(),
      }).outcome
    ).toBe('no_op_graphite_merge_queue');
    expect(
      evaluateEligibility({
        entry: entry(),
        plan: plan(),
        pr: pullRequest({ title: '[Graphite MQ] main <- feature' }),
        livePolicy: policy(),
      }).outcome
    ).toBe('no_op_graphite_merge_queue');
  });
});

function contextPage({
  nodes,
  totalCount,
  hasNextPage,
  endCursor,
  headRefOid = HEAD,
  commitOid = HEAD,
  includeMetadata = false,
}) {
  const commit = {
    oid: commitOid,
    statusCheckRollup: {
      contexts: { nodes, totalCount, pageInfo: { hasNextPage, endCursor } },
    },
  };
  return {
    data: {
      repository: {
        pullRequest: {
          ...(includeMetadata ? pullRequest() : { headRefOid }),
          commits: { nodes: [{ commit }] },
          ...(includeMetadata
            ? {
                labels: {
                  nodes: [],
                  totalCount: 0,
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              }
            : {}),
        },
      },
    },
  };
}

describe('statusCheckRollup pagination', () => {
  it('reads every page and proves the exact count', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      __typename: 'CheckRun',
      name: `check-${index}`,
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    }));
    const calls = [];
    const snapshot = await fetchPrSnapshot('JovieInc/Jovie', 16001, {
      ghJsonImpl: async args => {
        calls.push(args);
        return calls.length === 1
          ? contextPage({
              nodes: first,
              totalCount: 101,
              hasNextPage: true,
              endCursor: 'cursor-1',
              includeMetadata: true,
            })
          : contextPage({
              nodes: [greenChecks()[0]],
              totalCount: 101,
              hasNextPage: false,
              endCursor: 'cursor-2',
            });
      },
    });
    expect(snapshot.statusCheckRollup).toHaveLength(101);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('cursor=cursor-1');
  });

  it.each([
    ['missing cursor', { endCursor: null }, /omitted the next cursor/],
    ['head drift', {}, /head changed while paginating/],
    ['count drift', {}, /context count changed/],
    ['short final page', {}, /ended before all contexts/],
  ])('fails closed on %s', async (name, firstPatch, expected) => {
    let call = 0;
    await expect(
      fetchPrSnapshot('JovieInc/Jovie', 16001, {
        ghJsonImpl: async () => {
          call += 1;
          if (call === 1) {
            return contextPage({
              nodes: [greenChecks()[0]],
              totalCount: 3,
              hasNextPage: true,
              endCursor: 'cursor-1',
              includeMetadata: true,
              ...firstPatch,
            });
          }
          if (name === 'head drift') {
            return contextPage({
              nodes: [greenChecks()[1]],
              totalCount: 3,
              hasNextPage: false,
              endCursor: 'cursor-2',
              headRefOid: 'b'.repeat(40),
            });
          }
          return contextPage({
            nodes: [greenChecks()[1]],
            totalCount: name === 'count drift' ? 4 : 3,
            hasNextPage: false,
            endCursor: 'cursor-2',
          });
        },
      })
    ).rejects.toThrow(expected);
  });

  it('fails closed when the label page cannot prove current hold state', async () => {
    await expect(
      fetchPrSnapshot('JovieInc/Jovie', 16001, {
        ghJsonImpl: async () => {
          const response = contextPage({
            nodes: greenChecks(),
            totalCount: 4,
            hasNextPage: false,
            endCursor: null,
            includeMetadata: true,
          });
          response.data.repository.pullRequest.labels = {
            nodes: Array.from({ length: 100 }, (_, index) => ({
              name: `label-${index}`,
            })),
            totalCount: 101,
            pageInfo: { hasNextPage: true, endCursor: 'labels-1' },
          };
          return response;
        },
      })
    ).rejects.toThrow(/labels page was incomplete/);
  });
});

describe('mutation-boundary race closure', () => {
  it.each([
    ['native queue', { mergeQueueEntry: { id: 'MQE_1', position: 1 } }],
    ['auto-merge', { autoMergeRequest: { enabledAt: '2026-08-16T19:00:00Z' } }],
    ['hard hold', { labels: [{ name: 'fast' }] }],
    ['review', { reviewDecision: 'CHANGES_REQUESTED' }],
    [
      'checks',
      {
        statusCheckRollup: [
          ...greenChecks(),
          { __typename: 'CheckRun', name: 'new', status: 'IN_PROGRESS' },
        ],
      },
    ],
  ])('re-reads and stops when %s changes', async (_name, patch) => {
    let reads = 0;
    let mutations = 0;
    const { result } = await runApply({
      fetchPrImpl: async () => {
        reads += 1;
        return reads === 1 ? pullRequest() : pullRequest(patch);
      },
      rebaseImpl: async args => {
        const current = await args.preMutationCheckImpl({ timeoutMs: 1000 });
        if (!current.ok) {
          return {
            ok: false,
            updated: false,
            mutationAttempted: false,
            mutationApplied: false,
            category: current.category,
            reason: current.reason,
          };
        }
        mutations += 1;
        return { ok: true, updated: true, reason: 'updated' };
      },
    });
    expect(reads).toBe(2);
    expect(mutations).toBe(0);
    expect(result.outcome).toBe('update_failed');
    expect(result.mutationAttempted).toBe(false);
  });

  it('the shared updater invokes the final gate before its mutation call', async () => {
    let mutationCalls = 0;
    const snapshot = {
      ...pullRequest(),
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
        if (String(args[1]).includes('/git/commits/')) {
          return {
            sha: 'merge-oid',
            tree: { sha: 'tree-oid' },
            parents: [{ sha: BASE }, { sha: HEAD }],
          };
        }
        mutationCalls += 1;
        throw new Error('mutation must not run');
      },
      integrationProofImpl: async () => ({
        alreadyIntegrated: false,
        expectedIntegrationTreeOid: 'tree-oid',
        headTreeOid: 'head-tree-oid',
      }),
      preMutationCheckImpl: async () => ({
        ok: false,
        category: 'no_op_held',
        reason: 'hold appeared',
        observedHeadOid: HEAD,
      }),
    });
    expect('category' in result ? result.category : null).toBe('no_op_held');
    expect(result.mutationAttempted).toBe(false);
    expect(mutationCalls).toBe(0);
  });
});

describe('apply outcomes and idempotency', () => {
  it.each([
    [
      'successful apply',
      {
        ok: true,
        updated: true,
        mutationAttempted: true,
        mutationApplied: true,
        reason: 'updated',
      },
      'updated',
    ],
    [
      'no change',
      {
        ok: true,
        updated: false,
        mutationAttempted: false,
        mutationApplied: false,
        reason: 'already integrated',
      },
      'no_op_already_integrated',
    ],
    [
      'failure',
      {
        ok: false,
        updated: false,
        mutationAttempted: false,
        mutationApplied: false,
        reason: 'failed closed',
      },
      'update_failed',
    ],
  ])('records %s', async (_name, rebase, outcome) => {
    const { result, receiptPath } = await runApply({
      rebaseImpl: async args => {
        expect((await args.preMutationCheckImpl({ timeoutMs: 1000 })).ok).toBe(
          true
        );
        return rebase;
      },
    });
    expect(result.outcome).toBe(outcome);
    expect(JSON.parse(await readFile(receiptPath, 'utf8')).outcome).toBe(
      outcome
    );
  });

  it('reruns idempotently after a successful update', async () => {
    const fixture = await preparedFixture();
    let updated = false;
    let rebaseCalls = 0;
    const options = {
      planPath: fixture.planPath,
      planHash: fixture.bundle.planHash,
      trustedDefaultBranchSha: BASE,
      mode: 'apply',
      confirmation: fixture.bundle.planHash,
      prNumber: 16001,
      runId: '1',
      runAttempt: '1',
    };
    const dependencies = {
      nowImpl: () => NOW,
      fetchRepositoryPolicyImpl: async () => policy(),
      fetchPrImpl: async () =>
        pullRequest({ mergeStateStatus: updated ? 'CLEAN' : 'BEHIND' }),
      rebaseImpl: async args => {
        expect((await args.preMutationCheckImpl({ timeoutMs: 1000 })).ok).toBe(
          true
        );
        rebaseCalls += 1;
        updated = true;
        return {
          ok: true,
          updated: true,
          mutationAttempted: true,
          mutationApplied: true,
          reason: 'updated',
        };
      },
    };
    const first = await runPreparedEntry(
      { ...options, receiptPath: join(fixture.directory, 'first.json') },
      dependencies
    );
    const second = await runPreparedEntry(
      { ...options, receiptPath: join(fixture.directory, 'second.json') },
      dependencies
    );
    expect(first.outcome).toBe('updated');
    expect(second.outcome).toBe('no_op_already_integrated');
    expect(rebaseCalls).toBe(1);
  });
});

describe('receipt durability', () => {
  it.each([
    ['invalid JSON', '{', 'not used'],
    ['plan validation', `${JSON.stringify(plan({ maxParallel: 5 }))}\n`, ''],
    ['plan hash mismatch', null, 'f'.repeat(64)],
  ])('persists one error artifact for %s', async (_name, raw, planHashInput) => {
    const directory = await makeTemp();
    const planPath = join(directory, 'plan.json');
    const rawPlan = raw ?? `${JSON.stringify(plan())}\n`;
    const planHash = planHashInput || hash(rawPlan);
    await writeFile(planPath, rawPlan);
    const receiptPath = join(directory, 'receipt.json');
    await expect(
      runPreparedEntry(
        {
          planPath,
          planHash,
          trustedDefaultBranchSha: BASE,
          mode: 'apply',
          confirmation: planHash,
          prNumber: 16001,
          receiptPath,
          runId: '1',
          runAttempt: '1',
        },
        { nowImpl: () => NOW }
      )
    ).rejects.toThrow();
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    expect(receipt.outcome).toBe('error');
    expect(
      (await readdir(directory)).filter(name => name.endsWith('.json'))
    ).toEqual(expect.arrayContaining(['plan.json', 'receipt.json']));
    expect(
      (await readdir(directory)).some(name => name.includes('.tmp-'))
    ).toBe(false);
  });

  it('persists live-main and plan-validation failures before upload', async () => {
    const fixture = await preparedFixture();
    const liveReceipt = join(fixture.directory, 'live-main.json');
    const result = await runPreparedEntry(
      {
        planPath: fixture.planPath,
        planHash: fixture.bundle.planHash,
        trustedDefaultBranchSha: BASE,
        mode: 'dry-run',
        confirmation: '',
        prNumber: 16001,
        receiptPath: liveReceipt,
      },
      {
        nowImpl: () => NOW,
        fetchRepositoryPolicyImpl: async () => policy({ sha: 'b'.repeat(40) }),
      }
    );
    expect(result.outcome).toBe('no_op_default_branch_changed');
    expect(JSON.parse(await readFile(liveReceipt, 'utf8')).outcome).toBe(
      'no_op_default_branch_changed'
    );

    const invalidPath = join(fixture.directory, 'invalid-plan.json');
    await writeFile(invalidPath, '{');
    const planReceipt = join(fixture.directory, 'plan-receipt.json');
    await expect(
      runPlanCommand(
        {
          planPath: invalidPath,
          trustedDefaultBranchSha: BASE,
          mode: 'dry-run',
          confirmation: '',
          matrixPath: join(fixture.directory, 'matrix.json'),
          receiptPath: planReceipt,
        },
        { nowImpl: () => NOW }
      )
    ).rejects.toThrow();
    expect(JSON.parse(await readFile(planReceipt, 'utf8')).outcome).toBe(
      'error'
    );
  });

  it('serializes in-flight cancellation with distinct atomic temp paths', async () => {
    const directory = await makeTemp();
    const receiptPath = join(directory, 'receipt.json');
    const temporaryPaths = [];
    let releaseFirst = () => {};
    const firstBlocked = new Promise(resolve => {
      releaseFirst = () => resolve();
    });
    let firstReady = () => {};
    const ready = new Promise(resolve => {
      firstReady = () => resolve();
    });
    let writes = 0;
    const writer = createAtomicReceiptWriter(receiptPath, {
      randomIdImpl: () => `write-${++writes}`,
      beforeRenameImpl: async ({ temporary }) => {
        temporaryPaths.push(temporary);
        if (temporary.endsWith('write-1')) {
          firstReady();
          await firstBlocked;
        }
      },
    });
    const first = writer.write({ outcome: 'started' });
    await ready;
    const terminal = writer.write(
      { outcome: 'cancelled_indeterminate', mutationAttempted: null },
      { terminal: true }
    );
    const ignored = writer.write({ outcome: 'updated' });
    releaseFirst();
    await Promise.all([first, terminal, ignored]);
    expect(new Set(temporaryPaths).size).toBe(2);
    expect(JSON.parse(await readFile(receiptPath, 'utf8')).outcome).toBe(
      'cancelled_indeterminate'
    );
    expect(
      (await readdir(directory)).some(name => name.includes('.tmp-'))
    ).toBe(false);
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ])('persists a terminal receipt during a process-level %s interleaving', async signal => {
    const directory = await makeTemp();
    const receiptPath = join(directory, `${signal}.json`);
    const driver = `
        const mod = await import(process.argv[1]);
        const receiptPath = process.argv[2];
        const writer = mod.createAtomicReceiptWriter(receiptPath, {
          beforeRenameImpl: async ({ receipt }) => {
            if (receipt.outcome === 'started') {
              console.log('READY');
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
        });
        mod.installProcessSignalHandlers({
          getLatest: writer.getLatest,
          writeReceiptImpl: writer.write,
        });
        writer.write({schema:mod.RECEIPT_SCHEMA,kind:'item',outcome:'started',mutationAttempted:false,mutationApplied:false});
        setInterval(() => {}, 1000);
      `;
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', driver, MODULE_URL, receiptPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`child did not become ready: ${stderr}`)),
        5000
      );
      child.stdout.on('data', chunk => {
        if (String(chunk).includes('READY')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    child.kill(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`child did not exit: ${stderr}`));
      }, 5000);
      child.once('exit', code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });
    expect(exitCode).toBe(signal === 'SIGINT' ? 130 : 143);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    expect(receipt.outcome).toBe('cancelled_indeterminate');
    expect(receipt.mutationAttempted).toBeNull();
    expect(receipt.mutationApplied).toBeNull();
    expect(
      (await readdir(directory)).some(name => name.includes('.tmp-'))
    ).toBe(false);
  });
});

describe('workflow safety contract', () => {
  it('shares the auto-enroll mutex and never ignores a missing receipt', async () => {
    const workflow = await readFile(
      join(process.cwd(), '.github/workflows/pr-preparation-canary.yml'),
      'utf8'
    );
    const autoEnroll = await readFile(
      join(process.cwd(), '.github/workflows/merge-queue-autoenroll.yml'),
      'utf8'
    );
    expect(workflow).toContain('group: merge-queue-drain-mutex');
    expect(autoEnroll).toContain('group: merge-queue-drain-mutex');
    expect(workflow.match(/if-no-files-found: error/gu)).toHaveLength(2);
    expect(workflow).not.toContain('if-no-files-found: ignore');
    expect(workflow).not.toContain('continue-on-error: true');
  });
});
