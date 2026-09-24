import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FX_EXECUTOR_POLICY } from '../fx-remediation-lane.mjs';
import {
  normalizeFailureEvents,
  planFailureDispatch,
  ROLLING_CI_POLICY_VERSION,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
} from '../rolling-ci-dispatch.mjs';
import {
  buildFxPrompt,
  buildHostedAcceptanceReceipt,
  buildHostedCommitVariables,
  buildHostedPrelaunchReceipt,
  buildHostedRepairPlan,
  buildHostedTerminalReceipt,
  classifyHostedReceiptLiveness,
  classifyRunnerFailure,
  commitHostedRepair,
  FX_EXECUTION_RECEIPT_SCHEMA,
  FX_GITHUB_RUNNER_EXECUTOR,
  findOwnedAgents,
  isHostedRemediationSelfTrigger,
  launchCursorAgent,
  listCursorAgents,
  planFxLaunch,
  planFxWebhookRemediation,
  resolveDispatchWriter,
  resolveFxNamedOutcome,
  resolveWebhookRemediationRoute,
  revalidateHostedCanaryState,
  validateHostedRepairPath,
} from '../rolling-ci-fx.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  HANDOFF_SCHEMA,
  receiptMarker,
  resolveRemediationRoute,
} from '../rolling-ci-handoff.mjs';

const head = 'a'.repeat(40);
const CLI = resolve(import.meta.dirname, '..', 'rolling-ci-fx.mjs');
const trustedSource = {
  eventName: 'workflow_run',
  workflow: 'CI',
  producerEvent: 'pull_request',
  trustedPolicyRef: 'main',
  workflowPath: TRUSTED_CI_WORKFLOW_PATH,
};
const fxAdapter = { name: FX_ADAPTER_NAME, authConfigured: true };
const activeReceipt = {
  schema: HANDOFF_SCHEMA,
  pr: 17,
  head,
  status: 'active',
  leaseExpiresAt: '2026-08-22T03:00:00Z',
  acceptanceCriteria: ['exact-head green'],
  remainingChecks: ['ci-fast'],
  failureFingerprints: ['ci:policy-liveness'],
  remediationOwner: 'implementer',
};

function dispatch(overrides = {}) {
  return runDispatch({
    repository: 'JovieInc/Jovie',
    prNumber: 17,
    headSha: head,
    liveHead: head,
    workflowRunId: 9001,
    workflowRunAttempt: 1,
    failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
    source: trustedSource,
    checkSuiteId: 44,
    checks: [
      {
        name: 'ci-fast',
        conclusion: 'failure',
        headSha: head,
        checkSuiteId: 44,
      },
    ],
    writer: 'tim',
    priorCommentBody: '',
    conclusion: 'failure',
    ...overrides,
  });
}

function hostedFixture() {
  const dispatchResult = dispatch({ writer: 'fx-hosted' });
  const plan = buildHostedRepairPlan({
    dispatch: dispatchResult,
    headRefName: 'codex/repair-proof',
    changedFiles: [{ filename: 'apps/web/lib/proof.ts', status: 'modified' }],
  });
  const patchBytes = Buffer.from(
    'diff --git a/apps/web/lib/proof.ts b/apps/web/lib/proof.ts\n'
  );
  const fileBytes = Buffer.from('export const repaired = true;\n');
  const changes = [
    {
      path: 'apps/web/lib/proof.ts',
      status: 'M',
      symlink: false,
      bytes: fileBytes.length,
      sha256: createHash('sha256').update(fileBytes).digest('hex'),
    },
  ];
  const acceptance = buildHostedAcceptanceReceipt({
    plan,
    patchBytes,
    changes,
    executor: {
      ...FX_EXECUTOR_POLICY,
      observedModel: FX_EXECUTOR_POLICY.expectedModel,
      stepsUsed: 12,
    },
    now: new Date('2026-08-29T20:01:00.000Z'),
  });
  return { plan, patchBytes, fileBytes, changes, acceptance };
}

function hostedCiRun(overrides = {}) {
  return {
    id: 9001,
    run_attempt: 1,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    head_sha: head,
    status: 'completed',
    conclusion: 'failure',
    ...overrides,
  };
}

function hostedCanaryRequest(runInventory) {
  return vi.fn(async (path, _options) => {
    if (path.endsWith('/pulls/17')) {
      return {
        state: 'open',
        draft: false,
        base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
        head: {
          ref: 'codex/repair-proof',
          sha: head,
          repo: { full_name: 'JovieInc/Jovie', fork: false },
        },
        labels: [],
      };
    }
    if (path.includes('/statuses?')) return [];
    if (path.includes('/actions/runs?')) return runInventory;
    throw new Error(`unexpected hosted canary request: ${path}`);
  });
}

describe('hosted rolling CI repair policy', () => {
  it('plans one Jovie-only exact-head repair with policy-version idempotency', () => {
    const { plan } = hostedFixture();
    expect(plan).toMatchObject({
      schema: 'jovie-hosted-ci-repair-plan/v1',
      policyVersion: ROLLING_CI_POLICY_VERSION,
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      expectedHeadOid: head,
      producerEvent: 'pull_request',
      maxConcurrent: 8,
    });
    expect(plan.idempotencyKey).toContain(plan.fingerprint);
    expect(plan.idempotencyKey).toContain(ROLLING_CI_POLICY_VERSION);
    expect(plan.allowedPaths).toEqual(['apps/web/lib/proof.ts']);
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch({
          repository: 'JovieInc/LogYourBody',
        }),
        headRefName: 'codex/nope',
      })
    ).toThrow('repository must be JovieInc/Jovie');
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch(),
        headRefName: 'gh-readonly-queue/main/pr-17-deadbeef',
        changedFiles: [
          { filename: 'apps/web/lib/proof.ts', status: 'modified' },
        ],
      })
    ).toThrow('main, synthetic, or not a safe branch ref');
  });

  it('strictly denies workflows, secrets, migrations, auth, billing, release, deploy, and tests', () => {
    expect(validateHostedRepairPath('apps/web/lib/profile.ts').allowed).toBe(
      true
    );
    for (const path of [
      '.github/workflows/ci.yml',
      'apps/web/lib/API_SECRET.ts',
      'apps/web/drizzle/migrations/001.sql',
      'apps/web/app/auth/callback.ts',
      'apps/web/lib/auth.ts',
      'apps/web/lib/oauth-client.ts',
      'apps/web/app/billing/page.tsx',
      'apps/web/lib/billing.ts',
      'apps/web/lib/payment-client.ts',
      'apps/web/lib/migration.ts',
      'apps/web/lib/release.ts',
      'apps/web/lib/deploy.ts',
      'apps/web/proxy.ts',
      'apps/web/lib/deployment/release.ts',
      'apps/web/tests/profile.test.ts',
      'scripts/lib/rolling-ci-fx.mjs',
    ]) {
      expect(validateHostedRepairPath(path), path).toMatchObject({
        allowed: false,
      });
    }
  });

  it('limits the model patch to modified source files in the authenticated PR diff', () => {
    const { plan, patchBytes, changes, acceptance } = hostedFixture();
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch({ writer: 'fx-hosted' }),
        headRefName: 'codex/repair-proof',
        changedFiles: [
          { filename: '.github/workflows/ci.yml', status: 'modified' },
        ],
      })
    ).toThrow(
      'entire PR diff must contain only admitted modified source paths'
    );
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch({ writer: 'fx-hosted' }),
        headRefName: 'codex/repair-proof',
        changedFiles: [
          { filename: 'apps/web/lib/proof.ts', status: 'modified' },
          { filename: 'scripts/run-affected-tests.mjs', status: 'modified' },
        ],
      })
    ).toThrow(
      'entire PR diff must contain only admitted modified source paths'
    );
    expect(() =>
      buildHostedAcceptanceReceipt({
        plan,
        patchBytes,
        changes: [{ ...changes[0], path: 'apps/web/lib/unrelated.ts' }],
        executor: acceptance.executor,
        now: new Date('2026-08-29T20:01:00.000Z'),
      })
    ).toThrow('outside the exact PR diff');
  });

  it('binds tested artifact bytes to an atomic expected-head update', () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const variables = buildHostedCommitVariables({
      plan,
      acceptance,
      patchBytes,
      fileContents: { 'apps/web/lib/proof.ts': fileBytes },
    });
    expect(variables.input).toMatchObject({
      branch: {
        repositoryNameWithOwner: 'JovieInc/Jovie',
        branchName: 'codex/repair-proof',
      },
      expectedHeadOid: head,
    });
    expect(variables.input.fileChanges.additions).toEqual([
      {
        path: 'apps/web/lib/proof.ts',
        contents: fileBytes.toString('base64'),
      },
    ]);
    expect(() =>
      buildHostedCommitVariables({
        plan,
        acceptance,
        patchBytes,
        fileContents: {
          'apps/web/lib/proof.ts': Buffer.from('tampered'),
        },
      })
    ).toThrow('immutable artifact hash mismatch');
  });

  it('performs one real failed-CI to atomic-repair transition', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
          draft: false,
          base: {
            ref: 'main',
            repo: { full_name: 'JovieInc/Jovie' },
          },
          head: {
            ref: 'codex/repair-proof',
            sha: head,
            repo: { full_name: 'JovieInc/Jovie', fork: false },
          },
        };
      }
      if (path.includes('/statuses?')) return [];
      if (path.includes('/actions/runs?')) {
        return {
          total_count: 1,
          workflow_runs: [hostedCiRun()],
        };
      }
      expect(path).toBe('/graphql');
      expect(options.body.variables.input.expectedHeadOid).toBe(head);
      return {
        data: {
          createCommitOnBranch: {
            commit: { oid: 'b'.repeat(40), url: 'https://example.test/commit' },
          },
        },
      };
    });
    const result = await commitHostedRepair({
      plan,
      acceptance,
      patchBytes,
      fileContents: { 'apps/web/lib/proof.ts': fileBytes },
      readToken: 'read-token',
      writeToken: 'write-token',
      activationEnabled: 'true',
      activationCanaryPr: '17',
      request,
    });
    expect(result).toMatchObject({
      committed: true,
      outcome: 'repaired',
      committedHeadOid: 'b'.repeat(40),
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('aborts a green exact head before the writer and never calls GraphQL', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async path => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
          draft: false,
          base: {
            ref: 'main',
            repo: { full_name: 'JovieInc/Jovie' },
          },
          head: {
            ref: 'codex/repair-proof',
            sha: head,
            repo: { full_name: 'JovieInc/Jovie', fork: false },
          },
        };
      }
      if (path.includes('/statuses?')) return [];
      if (path.includes('/actions/runs?')) {
        return {
          total_count: 1,
          workflow_runs: [
            hostedCiRun({
              id: 9002,
              run_attempt: 2,
              conclusion: 'success',
            }),
          ],
        };
      }
      throw new Error(`unexpected hosted writer request: ${path}`);
    });
    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        activationEnabled: 'true',
        activationCanaryPr: '17',
        request,
      })
    ).resolves.toEqual({ committed: false, outcome: 'superseded_green' });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ draft: true }, 'live-pr-or-head-mismatch'],
    [{ labels: [{ name: 'incident' }] }, 'live-pr-hold'],
  ])(
    'rejects a live PR hold or draft before the atomic writer',
    async (change, blockedBy) => {
      const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
      const request = vi.fn(async () => ({
        state: 'open',
        draft: false,
        base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
        head: {
          ref: 'codex/repair-proof',
          sha: head,
          repo: { full_name: 'JovieInc/Jovie', fork: false },
        },
        ...change,
      }));
      await expect(
        commitHostedRepair({
          plan,
          acceptance,
          patchBytes,
          fileContents: { 'apps/web/lib/proof.ts': fileBytes },
          readToken: 'read-token',
          writeToken: 'write-token',
          activationEnabled: 'true',
          activationCanaryPr: '17',
          request,
        })
      ).resolves.toMatchObject({
        committed: false,
        outcome: 'stale_head',
        blockedBy,
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it('revalidates the run-scoped canary values against live PR and HA status state', async () => {
    const { plan } = hostedFixture();
    const request = hostedCanaryRequest({
      total_count: 1,
      workflow_runs: [hostedCiRun()],
    });
    await expect(
      revalidateHostedCanaryState({
        plan,
        activationEnabled: 'true',
        activationCanaryPr: '17',
        token: 'read-token',
        request,
      })
    ).resolves.toEqual({ allowed: true, reason: 'live-canary-clear' });
    expect(request).toHaveBeenCalledTimes(3);
    expect(
      request.mock.calls.every(([, options]) => options.token === 'read-token')
    ).toBe(true);
  });

  it.each([
    [
      'green rerun',
      hostedCiRun({ run_attempt: 2, conclusion: 'success' }),
      { allowed: false, reason: 'ci-superseded-green' },
    ],
    [
      'changed failed attempt',
      hostedCiRun({ run_attempt: 2 }),
      { allowed: false, reason: 'ci-attempt-stale' },
    ],
    [
      'same failed attempt',
      hostedCiRun(),
      { allowed: true, reason: 'live-canary-clear' },
    ],
  ])(
    'requires the exact current failed CI attempt before spend: %s',
    async (_name, run, expected) => {
      const { plan } = hostedFixture();
      const request = hostedCanaryRequest({
        total_count: 1,
        workflow_runs: [run],
      });
      await expect(
        revalidateHostedCanaryState({
          plan,
          activationEnabled: 'true',
          activationCanaryPr: '17',
          token: 'read-token',
          request,
        })
      ).resolves.toEqual(expected);
      expect(request).toHaveBeenCalledTimes(3);
    }
  );

  it.each([
    ['malformed response', null],
    ['missing workflow run list', { total_count: 1 }],
    [
      'truncated page',
      {
        total_count: 100,
        workflow_runs: Array.from({ length: 100 }, (_, index) =>
          hostedCiRun({ id: 9001 + index })
        ),
      },
    ],
    [
      'reported count mismatch',
      { total_count: 2, workflow_runs: [hostedCiRun()] },
    ],
  ])(
    'fails closed when the latest CI run inventory is incomplete: %s',
    async (_name, runInventory) => {
      const { plan } = hostedFixture();
      const request = hostedCanaryRequest(runInventory);
      await expect(
        revalidateHostedCanaryState({
          plan,
          activationEnabled: 'true',
          activationCanaryPr: '17',
          token: 'read-token',
          request,
        })
      ).resolves.toEqual({
        allowed: false,
        reason: 'ci-run-inventory-incomplete',
      });
      expect(request).toHaveBeenCalledTimes(3);
    }
  );

  it.each([
    [
      { activationEnabled: 'false', activationCanaryPr: '17' },
      'canary-disabled',
    ],
    [
      { activationEnabled: 'true', activationCanaryPr: '18' },
      'canary-pr-mismatch',
    ],
  ])(
    'fails closed when the canary snapshot changes: %s',
    async (activation, reason) => {
      const { plan } = hostedFixture();
      const request = vi.fn();
      await expect(
        revalidateHostedCanaryState({
          plan,
          ...activation,
          token: 'read-token',
          request,
        })
      ).resolves.toEqual({ allowed: false, reason });
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ headSha: 'c'.repeat(40) }, 'live-pr-or-head-mismatch'],
    [{ labels: [{ name: 'incident' }] }, 'live-pr-hold'],
  ])(
    'blocks the live FX boundary on a changed head or PR hold: %s',
    async (change, reason) => {
      const { plan } = hostedFixture();
      const changedHeadSha = 'headSha' in change ? change.headSha : head;
      const labels = 'labels' in change ? change.labels : [];
      const request = vi.fn(async () => ({
        state: 'open',
        draft: false,
        base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
        labels,
        head: {
          ref: 'codex/repair-proof',
          sha: changedHeadSha,
          repo: { full_name: 'JovieInc/Jovie', fork: false },
        },
      }));
      await expect(
        revalidateHostedCanaryState({
          plan,
          activationEnabled: 'true',
          activationCanaryPr: '17',
          token: 'read-token',
          request,
        })
      ).resolves.toEqual({ allowed: false, reason });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['success', 'ha-remediation-receipt-present'],
    ['pending', 'ha-remediation-receipt-present'],
  ])(
    'blocks FX when an exact-head HA %s receipt predates the run',
    async (state, reason) => {
      const { plan } = hostedFixture();
      const request = vi.fn(async path => {
        if (path.endsWith('/pulls/17')) {
          return {
            state: 'open',
            draft: false,
            base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
            head: {
              ref: 'codex/repair-proof',
              sha: head,
              repo: { full_name: 'JovieInc/Jovie', fork: false },
            },
            labels: [],
          };
        }
        return [{ context: 'ha-ci-remediator-poke', state }];
      });
      await expect(
        revalidateHostedCanaryState({
          plan,
          activationEnabled: 'true',
          activationCanaryPr: '17',
          token: 'read-token',
          request,
        })
      ).resolves.toEqual({ allowed: false, reason });
    }
  );

  it('blocks when the exact-head HA status inventory is truncated', async () => {
    const { plan } = hostedFixture();
    const request = vi.fn(async path => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
          draft: false,
          base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
          head: {
            ref: 'codex/repair-proof',
            sha: head,
            repo: { full_name: 'JovieInc/Jovie', fork: false },
          },
          labels: [],
        };
      }
      return Array.from({ length: 100 }, () => ({}));
    });
    await expect(
      revalidateHostedCanaryState({
        plan,
        activationEnabled: 'true',
        activationCanaryPr: '17',
        token: 'read-token',
        request,
      })
    ).resolves.toEqual({
      allowed: false,
      reason: 'ha-receipt-inventory-incomplete',
    });
  });

  it('blocks the trusted writer when a pre-existing HA receipt appears after testing', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async path => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
          draft: false,
          base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
          head: {
            ref: 'codex/repair-proof',
            sha: head,
            repo: { full_name: 'JovieInc/Jovie', fork: false },
          },
          labels: [],
        };
      }
      return [{ context: 'ha-ci-remediator-poke', state: 'pending' }];
    });
    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        activationEnabled: 'true',
        activationCanaryPr: '17',
        request,
      })
    ).resolves.toMatchObject({
      committed: false,
      outcome: 'stale_head',
      blockedBy: 'ha-remediation-receipt-present',
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.some(([path]) => path === '/graphql')).toBe(
      false
    );
  });

  it('uses typed acceptance and terminal receipts for liveness', () => {
    const { plan, acceptance } = hostedFixture();
    const prelaunch = buildHostedPrelaunchReceipt({
      plan,
      now: new Date('2026-08-29T20:00:00.000Z'),
    });
    expect(
      classifyHostedReceiptLiveness({
        plan,
        prelaunch,
        now: new Date('2026-08-29T20:01:00.000Z'),
      })
    ).toEqual({ live: false, state: 'prelaunch_only' });
    expect(
      classifyHostedReceiptLiveness({
        plan,
        prelaunch,
        acceptance,
        now: new Date('2026-08-29T20:02:00.000Z'),
      })
    ).toEqual({ live: true, state: 'accepted' });
    const terminal = buildHostedTerminalReceipt({
      plan,
      acceptance,
      outcome: 'repaired',
      committedHeadOid: 'b'.repeat(40),
      now: new Date('2026-08-29T20:03:00.000Z'),
    });
    expect(
      classifyHostedReceiptLiveness({
        plan,
        prelaunch,
        acceptance,
        terminal,
        now: new Date('2026-08-29T20:04:00.000Z'),
      })
    ).toEqual({ live: false, state: 'terminal', outcome: 'repaired' });
  });

  it('blocks only a remediation-generated repeat of the same fingerprint', () => {
    const { plan } = hostedFixture();
    const message = `fix(ci): apply bounded hosted remediation\n\nJovie hosted CI remediation for PR #17.\n\nPolicy: ${plan.policyVersion}\nFailure: ${plan.fingerprint}`;
    expect(
      isHostedRemediationSelfTrigger({ plan, commitMessage: message })
    ).toBe(true);
    expect(
      isHostedRemediationSelfTrigger({
        plan,
        commitMessage: message.replace(plan.fingerprint, 'ci:different'),
      })
    ).toBe(false);
  });
});

describe('rolling CI FX webhook remediation', () => {
  it('keeps pickup-end implementer routing when no handoff receipt exists', () => {
    expect(
      resolveRemediationRoute({
        receipt: null,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toEqual({ route: 'implementer', writer: 'tim' });
  });

  it('routes webhook ingress to FX when no handoff receipt exists', () => {
    expect(
      resolveWebhookRemediationRoute({
        receipt: null,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toMatchObject({
      route: 'fx',
      writer: FX_ADAPTER_NAME,
      failure: FX_HANDOFF_FAILURE,
      reason: 'no_handoff_receipt',
    });
  });

  it('holds FX when the implementer lease is still live', () => {
    expect(
      resolveWebhookRemediationRoute({
        receipt: activeReceipt,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
        now: '2026-08-22T01:00:00Z',
      })
    ).toMatchObject({
      route: 'implementer',
      writer: 'implementer',
      reason: 'implementer_lease_live',
    });
    expect(
      planFxWebhookRemediation({
        dispatch: dispatch(),
        receipt: activeReceipt,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
        cursorApiKey: 'cursor-key',
        now: '2026-08-22T01:00:00Z',
      }).launch
    ).toMatchObject({ action: 'skip', reason: 'implementer_lease_live' });
  });

  it('fails closed when FX auth is missing on the webhook path', () => {
    expect(
      resolveWebhookRemediationRoute({
        receipt: null,
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: FX_ADAPTER_NAME, authConfigured: false },
      })
    ).toMatchObject({
      route: 'configuration_incident',
      reason: 'fx-auth-missing',
    });
  });

  it('rejects merge_group before either hosted or cloud FX planning', () => {
    expect(() =>
      dispatch({
        writer: FX_ADAPTER_NAME,
        source: { ...trustedSource, producerEvent: 'merge_group' },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
  });

  it('launches Cursor-direct repair against the current PR without a sibling PR', () => {
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({ writer: FX_ADAPTER_NAME }),
      receipt: null,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      cursorApiKey: 'cursor-key',
      remoteMutationAllowed: true,
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      headRef: 'cursor/fx-ci-cache-gc-aee1',
    });
    expect(planned.launch.action).toBe('launch');
    expect(planned.launch.request.autoCreatePR).toBe(false);
    expect(planned.launch.request.workOnCurrentBranch).toBe(true);
    expect(planned.launch.request.repos[0].prUrl).toBe(
      'https://github.com/JovieInc/Jovie/pull/17'
    );
    expect(planned.launch.request.prompt.text).toContain(head);
  });

  it('launches a runner-local FX repair without Cursor or remote mutation', () => {
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({ writer: FX_ADAPTER_NAME }),
      receipt: null,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      fxAuthConfigured: true,
      runnerLocalAvailable: true,
      cursorApiKey: '',
      remoteMutationAllowed: false,
      repository: 'JovieInc/Jovie',
      prNumber: 16730,
      headSha: head,
      sourceHead: head,
      headRef: 'fallback/JOV-5464-fix',
    });

    expect(planned).toMatchObject({
      launch: {
        action: 'launch_local',
        executor: FX_GITHUB_RUNNER_EXECUTOR,
        request: {
          repository: 'JovieInc/Jovie',
          prNumber: 16730,
          headSha: head,
          sourceHead: head,
        },
      },
      outcome: 'launched',
    });
    expect(planned.launch.request).not.toHaveProperty('repos');
    expect(planned.launch.request.prompt.text).toContain('.fx-ci/failure.log');
    expect(planned.launch.request.prompt.text).toContain(
      'do not commit, push, open a pull request, merge, or access credentials'
    );
  });

  it('preserves one-writer safety while an implementer lease is active', () => {
    const planned = planFxWebhookRemediation({
      dispatch: dispatch(),
      receipt: activeReceipt,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      fxAuthConfigured: true,
      runnerLocalAvailable: true,
      cursorApiKey: '',
      remoteMutationAllowed: false,
      now: '2026-08-22T01:00:00Z',
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      sourceHead: head,
      headRef: 'fix/ci',
    });

    expect(planned.route).toMatchObject({ route: 'implementer' });
    expect(planned.launch).toMatchObject({
      action: 'skip',
      reason: 'implementer_lease_live',
    });
    expect(planned.outcome).toBe('implementer_owned');
  });

  it('keeps runner-local instructions out of the legacy remote prompt', () => {
    const remote = buildFxPrompt({
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      fingerprint: 'ci:remote',
    });
    const local = buildFxPrompt({
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      fingerprint: 'ci:local',
      runnerLocal: true,
    });

    expect(remote).not.toContain('.fx-ci/failure.log');
    expect(remote).not.toContain('ephemeral GitHub Actions runner');
    expect(local).toContain('.fx-ci/failure.log');
    expect(local).toContain('ephemeral GitHub Actions runner');
  });

  it('routes runner failures to runner-local FX instead of terminalizing them', () => {
    const checkoutJobs = [
      { name: 'ci-fast', steps: ['Checkout exact PR head'] },
    ];
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({ failedJobs: checkoutJobs }),
      receipt: activeReceipt,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      fxAuthConfigured: true,
      runnerLocalAvailable: true,
      now: '2026-08-22T01:00:00Z',
      failedJobs: checkoutJobs,
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      sourceHead: head,
      headRef: 'fix/ci',
    });

    expect(planned.runnerClass).toBe('checkout');
    expect(planned.launch).toMatchObject({
      action: 'launch_local',
      executor: FX_GITHUB_RUNNER_EXECUTOR,
    });
    expect(planned.outcome).toBe('launched');
    expect(planned.dispatch.state.claim.status).not.toBe('terminal');
  });

  it('CLI selects runner-local FX when AI Gateway auth is configured', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 16730,
      headSha: head,
      liveHead: head,
      sourceHead: head,
      headRef: 'fallback/JOV-5464-fix',
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
      source: trustedSource,
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: 'tim',
      priorCommentBody: '',
      conclusion: 'failure',
      fxAuthConfigured: true,
      runnerLocalAvailable: true,
      cursorApiKey: '',
      remoteMutationAllowed: false,
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });

    expect(launched.status, launched.stderr).toBe(0);
    expect(JSON.parse(launched.stdout)).toMatchObject({
      route: { route: 'fx' },
      launch: {
        action: 'launch_local',
        executor: FX_GITHUB_RUNNER_EXECUTOR,
      },
      outcome: 'launched',
    });
  });

  it('deduplicates when a Cursor agent already owns the fingerprint', () => {
    const events = normalizeFailureEvents({
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
      source: trustedSource,
      checkSuiteId: 44,
    });
    expect(
      planFxLaunch({
        repository: 'JovieInc/Jovie',
        prNumber: 17,
        headSha: head,
        fingerprint: events[0].fingerprint,
        cursorAgents: [{ id: 'agent-1', prompt: events[0].fingerprint }],
        cursorApiKey: 'cursor-key',
        remoteMutationAllowed: true,
      })
    ).toMatchObject({
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      existingAgentIds: ['agent-1'],
    });
    expect(
      findOwnedAgents([{ id: 'agent-1', prompt: 'nope' }], 'ci:abc')
    ).toEqual([]);
  });

  it('reads the Cursor v1 list envelope and preserves fingerprint dedupe', async () => {
    const fingerprint = 'ci:exact-fingerprint';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          items: [
            {
              id: 'bc-agent-1',
              name: `Jovie CI repair ${fingerprint}`,
              status: 'ACTIVE',
            },
          ],
        }),
    });
    const agents = await listCursorAgents({
      cursorApiKey: 'cursor-key',
      fetchImpl,
    });
    expect(agents).toHaveLength(1);
    expect(findOwnedAgents(agents, fingerprint)).toEqual(['bc-agent-1']);
  });

  it('posts the Cursor v1 request schema without creating a sibling PR', async () => {
    const request = planFxLaunch({
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      fingerprint: 'ci:request-schema',
      cursorApiKey: 'cursor-key',
      remoteMutationAllowed: true,
    }).request;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          agent: { id: 'bc-agent-1' },
          run: { id: 'run-1', agentId: 'bc-agent-1' },
        }),
    });
    await launchCursorAgent({ request, cursorApiKey: 'cursor-key', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cursor.com/v1/agents',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      })
    );
    expect(request).toMatchObject({
      repos: [
        {
          url: 'https://github.com/JovieInc/Jovie',
          prUrl: 'https://github.com/JovieInc/Jovie/pull/17',
        },
      ],
      workOnCurrentBranch: true,
      autoCreatePR: false,
    });
  });

  it('reports bounded sanitized Cursor 400 diagnostics', async () => {
    const secret = 'cursor-secret-value';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            code: 'invalid_request',
            message: 'repos is required',
            apiKey: secret,
            detail: `Bearer ${secret}`,
          },
          padding: 'x'.repeat(1_000),
        }),
    });
    const error = await launchCursorAgent({
      request: {},
      cursorApiKey: 'cursor-key',
      fetchImpl,
    }).catch(caught => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(
      /code=invalid_request; message=repos is required; body=/
    );
    expect(error.message).not.toContain(secret);
    expect(error.message.length).toBeLessThan(700);
  });

  it('rejects launch acceptance without a bound agent and run', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ agent: { id: 'bc-agent-1' } }),
    });
    await expect(
      launchCursorAgent({
        request: {},
        cursorApiKey: 'cursor-key',
        fetchImpl,
      })
    ).rejects.toThrow('cursor launch returned no bound agent/run acceptance');
  });

  it('does not steal a live implementer comment claim when dispatching', () => {
    expect(
      resolveDispatchWriter({
        route: { route: 'fx', writer: FX_ADAPTER_NAME },
        priorClaimWriter: 'tim',
        implementer: 'tim',
      })
    ).toBe('tim');
  });

  it('uses the source PR author when present, else FX on blank merge_group LIVE_AUTHOR', () => {
    expect(
      resolveDispatchWriter({
        route: { route: 'fx', writer: FX_ADAPTER_NAME },
        implementer: 'tim',
      })
    ).toBe('tim');
    expect(
      resolveDispatchWriter({
        route: { route: 'fx', writer: FX_ADAPTER_NAME },
        implementer: '',
      })
    ).toBe(FX_ADAPTER_NAME);
    expect(
      resolveDispatchWriter({
        route: { route: 'configuration_incident', writer: null },
        implementer: '   ',
      })
    ).toBe(FX_ADAPTER_NAME);
    expect(
      resolveDispatchWriter({
        route: { route: 'configuration_incident', writer: null },
        implementer: 'tim',
      })
    ).toBe('tim');
    expect(
      resolveDispatchWriter({
        route: { route: 'implementer', writer: '' },
        implementer: '',
      })
    ).toBe(FX_ADAPTER_NAME);
  });

  it('deliberate red: rejects merge_group before legacy FX can terminalize it', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 16418,
      headSha: head,
      liveHead: head,
      sourceHead: 'b'.repeat(40),
      headRef: 'cursor/measured-merge-group',
      workflowRunId: 32621638955,
      workflowRunAttempt: 1,
      failedJobs: [
        { name: 'ci-fast', steps: ['Typecheck'] },
        { name: 'runner-bootstrap', steps: ['Set up job'] },
      ],
      source: { ...trustedSource, producerEvent: 'merge_group' },
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: '',
      priorCommentBody: '',
      conclusion: 'failure',
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).not.toBe(0);
    expect(launched.stderr).toContain(
      'failure source is not an authenticated CI workflow_run'
    );
  });

  it('CLI fails closed instead of launching a remote-writing FX executor', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      liveHead: head,
      headRef: 'fix/ci',
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [
        { name: 'ci-fast', steps: ['Typecheck'] },
        { name: 'runner-bootstrap', steps: ['Set up job'] },
      ],
      source: trustedSource,
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: 'tim',
      priorCommentBody: '',
      conclusion: 'failure',
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).toBe(0);
    const planned = JSON.parse(launched.stdout);
    expect(planned).toMatchObject({
      route: { route: 'fx' },
      launch: {
        action: 'configuration_incident',
        reason: 'fx-safe-executor-unavailable',
        receipt: {
          schema: FX_EXECUTION_RECEIPT_SCHEMA,
          terminal: true,
          result: 'remote_mutation_not_authorized',
          repository: 'JovieInc/Jovie',
          prNumber: 17,
          headSha: head,
        },
      },
      dispatch: { mutate: true, action: 'terminal_configuration_incident' },
      outcome: 'blocked_executor',
    });
    const terminalFingerprint = planned.launch.receipt.fingerprint;
    const unrelatedEvent = planned.dispatch.events.find(
      event => event.fingerprint !== terminalFingerprint
    );
    const unrelatedFingerprint = unrelatedEvent?.fingerprint;
    expect(
      planned.dispatch.state.failures[terminalFingerprint].terminalReceipt
        .terminal
    ).toBe(true);
    expect(unrelatedFingerprint).toBeDefined();
    expect(
      planned.dispatch.state.failures[unrelatedFingerprint]
    ).toBeUndefined();
    expect(planned.dispatch.body).toContain('## FX execution terminal');
    expect(planned.dispatch.body).toContain('jovie-fx-execution-receipt');

    const terminalEvent = planned.dispatch.events.find(
      event => event.fingerprint === terminalFingerprint
    );
    expect(
      planFailureDispatch({
        event: {
          ...terminalEvent,
          attempt: 2,
          delivery: `44:2:${terminalFingerprint}`,
        },
        liveHead: head,
        writer: 'tim',
        priorState: planned.dispatch.state,
      })
    ).toMatchObject({
      action: 'terminal_configuration_incident',
      mutate: false,
    });
    expect(
      planFailureDispatch({
        event: {
          ...unrelatedEvent,
          attempt: 2,
          delivery: `44:2:${unrelatedFingerprint}`,
        },
        liveHead: head,
        writer: 'tim',
        priorState: planned.dispatch.state,
      })
    ).toMatchObject({
      action: 'dispatch_implementer',
      mutate: true,
    });
    const held = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify({
        ...input,
        handoffCommentBody: receiptMarker(
          'jovie-rolling-ci-handoff',
          activeReceipt
        ),
        now: '2026-08-22T01:00:00Z',
      }),
      encoding: 'utf8',
    });
    expect(held.status).toBe(0);
    expect(JSON.parse(held.stdout).launch).toMatchObject({
      action: 'skip',
      reason: 'implementer_lease_live',
    });
  });

  it('classifies checkout, infra, and flake separately from product failures', () => {
    expect(
      classifyRunnerFailure([
        { name: 'ci-fast', steps: ['Checkout exact PR head'] },
      ])
    ).toBe('checkout');
    expect(
      classifyRunnerFailure([
        { name: 'ci-fast', conclusion: 'startup_failure', steps: [] },
      ])
    ).toBe('infra');
    expect(
      classifyRunnerFailure([{ name: 'ci-fast', steps: ['flake retry'] }])
    ).toBe('flake');
    expect(
      classifyRunnerFailure([{ name: 'ci-fast', steps: ['Typecheck'] }])
    ).toBeNull();
    expect(resolveFxNamedOutcome({ launch: { action: 'launch' } })).toBe(
      'launched'
    );
    expect(
      resolveFxNamedOutcome({
        launch: { action: 'configuration_incident', reason: 'fx-auth-missing' },
      })
    ).toBe('no_key');
    expect(
      resolveFxNamedOutcome({
        launch: {
          action: 'configuration_incident',
          reason: 'fx-safe-executor-unavailable',
        },
      })
    ).toBe('blocked_executor');
  });

  it('terminalizes checkout failures when only a remote-writing executor exists', () => {
    const checkoutJobs = [
      { name: 'ci-fast', steps: ['Checkout exact PR head'] },
    ];
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({ failedJobs: checkoutJobs }),
      receipt: activeReceipt,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      cursorApiKey: 'cursor-key',
      now: '2026-08-22T01:00:00Z',
      failedJobs: checkoutJobs,
    });
    expect(planned.launch).toMatchObject({
      action: 'configuration_incident',
      reason: 'fx-safe-executor-unavailable',
    });
    expect(planned.runnerClass).toBe('checkout');
    expect(planned.outcome).toBe('blocked_executor');
    expect(planned.dispatch.state.claim.status).toBe('terminal');
  });

  it('CLI terminalizes checkout failures when LIVE_AUTHOR is empty', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      liveHead: head,
      headRef: 'fix/ci',
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Checkout exact PR head'] }],
      source: trustedSource,
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: '',
      priorCommentBody: '',
      conclusion: 'failure',
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).toBe(0);
    expect(launched.stderr).not.toContain('writer is required');
    expect(JSON.parse(launched.stdout)).toMatchObject({
      launch: {
        action: 'configuration_incident',
        reason: 'fx-safe-executor-unavailable',
      },
      outcome: 'blocked_executor',
      runnerClass: 'checkout',
      dispatch: { mutate: true, action: 'terminal_configuration_incident' },
    });
    expect(JSON.parse(launched.stdout).dispatch.state.claim.writer).toBe(
      FX_ADAPTER_NAME
    );

    const heldCheckout = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify({
        ...input,
        writer: 'tim',
        handoffCommentBody: receiptMarker(
          'jovie-rolling-ci-handoff',
          activeReceipt
        ),
        now: '2026-08-22T01:00:00Z',
      }),
      encoding: 'utf8',
    });
    expect(heldCheckout.status).toBe(0);
    expect(heldCheckout.stderr).not.toContain('writer is required');
    expect(JSON.parse(heldCheckout.stdout)).toMatchObject({
      launch: {
        action: 'configuration_incident',
        reason: 'fx-safe-executor-unavailable',
      },
      outcome: 'blocked_executor',
      runnerClass: 'checkout',
    });
  });
});
