import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeFailureEvents,
  ROLLING_CI_POLICY_VERSION,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
} from '../rolling-ci-dispatch.mjs';
import {
  applyHostedPatchProposal,
  buildHostedAcceptanceReceipt,
  buildHostedCommitVariables,
  buildHostedPrelaunchReceipt,
  buildHostedRepairPlan,
  buildHostedTerminalReceipt,
  classifyHostedReceiptLiveness,
  classifyRunnerFailure,
  commitHostedRepair,
  findOwnedAgents,
  HOSTED_CURSOR_ARCHIVE_SHA256,
  HOSTED_CURSOR_ARCHIVE_URL,
  HOSTED_CURSOR_VERSION,
  isHostedRemediationSelfTrigger,
  launchCursorAgent,
  listCursorAgents,
  planFxLaunch,
  planFxWebhookRemediation,
  promoteHostedCandidateReceipt,
  resolveDispatchWriter,
  resolveFxNamedOutcome,
  resolveHostedHandoffAdmission,
  resolveHostedTerminalOutcome,
  resolveWebhookRemediationRoute,
  validateHostedCandidateTree,
  validateHostedGateAdmission,
  validateHostedPolicyBase,
  validateHostedRepairPath,
  verifyHostedRepairFiles,
} from '../rolling-ci-fx.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  HANDOFF_SCHEMA,
  receiptMarker,
  resolveRemediationRoute,
} from '../rolling-ci-handoff.mjs';

const head = 'a'.repeat(40);
const policyHead = 'd'.repeat(40);
const CLI = resolve(import.meta.dirname, '..', 'rolling-ci-fx.mjs');
const hostedPath = 'apps/web/components/marketing/Proof.tsx';
const hostedOutsidePath = 'apps/web/components/marketing/AnotherSafeFile.tsx';
const trustedSource = {
  eventName: 'workflow_run',
  workflow: 'CI',
  producerEvent: 'pull_request',
  trustedPolicyRef: 'main',
  workflowPath: TRUSTED_CI_WORKFLOW_PATH,
};
const fxAdapter = { name: FX_ADAPTER_NAME, authConfigured: true };

function modifiedPullFiles(...filenames) {
  return filenames.map(filename => ({ filename, status: 'modified' }));
}

function runGit(repository, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    input: options.input,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}
const gateReceipt = {
  schema: 'jovie-fleet-gate/v1',
  observedAt: '2026-08-29T20:00:00.000Z',
  remediationAdmission: {
    allowed: true,
    localAllowed: true,
    pushAllowed: true,
    activities: ['bounded-local-diagnostics', 'expected-head-pr-update'],
    maxConcurrent: 4,
    authority: 'single-pr-writer-exact-head',
  },
  concurrency: {
    gem: {
      maxConcurrent: 4,
      evidenceAccepted: true,
      newMutationAllowed: true,
    },
  },
};
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
    policySha: policyHead,
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
    fileRecords: modifiedPullFiles(hostedPath),
    policySha: policyHead,
  });
  const patchBytes = Buffer.from(
    `diff --git a/${hostedPath} b/${hostedPath}\n`
  );
  const fileBytes = Buffer.from('export const repaired = true;\n');
  const changes = [
    {
      path: hostedPath,
      status: 'M',
      symlink: false,
      bytes: fileBytes.length,
      sha256: createHash('sha256').update(fileBytes).digest('hex'),
    },
  ];
  const acceptance = buildHostedAcceptanceReceipt({
    plan,
    gateReceipt,
    patchBytes,
    changes,
    executor: {
      kind: 'cursor-cli',
      archiveUrl: HOSTED_CURSOR_ARCHIVE_URL,
      archiveSha256: HOSTED_CURSOR_ARCHIVE_SHA256,
      binarySha256: 'f'.repeat(64),
      version: HOSTED_CURSOR_VERSION,
    },
    now: new Date('2026-08-29T20:01:00.000Z'),
  });
  return { plan, patchBytes, fileBytes, changes, acceptance };
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
      maxConcurrent: 1,
    });
    expect(plan.idempotencyKey).toContain(plan.fingerprint);
    expect(plan.idempotencyKey).toContain(policyHead);
    expect(plan.idempotencyKey).toContain(ROLLING_CI_POLICY_VERSION);
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch({
          repository: 'JovieInc/LogYourBody',
        }),
        headRefName: 'codex/nope',
        fileRecords: modifiedPullFiles(hostedPath),
        policySha: policyHead,
      })
    ).toThrow('repository must be JovieInc/Jovie');
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch(),
        headRefName: 'gh-readonly-queue/main/pr-17-deadbeef',
        fileRecords: modifiedPullFiles(hostedPath),
        policySha: policyHead,
      })
    ).toThrow('main, synthetic, or not a safe branch ref');
  });

  it('admits a same-head retry after trusted policy supersedes an old receipt', () => {
    const prior = dispatch({ writer: 'fx-hosted' });
    const currentPolicy = 'e'.repeat(40);
    const retried = dispatch({
      writer: 'fx-hosted',
      policySha: currentPolicy,
      priorCommentBody: prior.body,
    });
    expect(retried.action).toBe('dispatch_superseding_policy');
    expect(
      buildHostedRepairPlan({
        dispatch: retried,
        headRefName: 'codex/repair-proof',
        fileRecords: modifiedPullFiles(hostedPath),
        policySha: currentPolicy,
      })
    ).toMatchObject({ policySha: currentPolicy });
  });

  it('requires a fresh typed gate and clamps effective concurrency to one', () => {
    expect(
      validateHostedGateAdmission({
        receipt: gateReceipt,
        now: new Date('2026-08-29T20:04:59.000Z'),
      })
    ).toMatchObject({ accepted: true, maxConcurrent: 1 });
    expect(
      validateHostedGateAdmission({
        receipt: gateReceipt,
        now: new Date('2026-08-29T20:05:01.000Z'),
      })
    ).toEqual({
      accepted: false,
      reason: 'fresh-typed-capacity-not-admitted',
    });
    expect(
      validateHostedGateAdmission({
        receipt: {
          ...gateReceipt,
          remediationAdmission: {
            ...gateReceipt.remediationAdmission,
            pushAllowed: false,
            maxConcurrent: 0,
          },
        },
        now: new Date('2026-08-29T20:01:00.000Z'),
      }).accepted
    ).toBe(false);
    expect(
      validateHostedGateAdmission({
        receipt: {
          ...gateReceipt,
          remediationAdmission: {
            ...gateReceipt.remediationAdmission,
            authority: 'unbound-writer',
          },
        },
        now: new Date('2026-08-29T20:01:00.000Z'),
      }).accepted
    ).toBe(false);
  });

  it('honors the exact-head implementer lease before hosted admission', () => {
    const activeComment = receiptMarker(
      'jovie-rolling-ci-handoff',
      activeReceipt
    );
    const input = {
      comments: [activeComment],
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      liveHead: head,
      now: '2026-08-22T01:00:00Z',
    };
    expect(resolveHostedHandoffAdmission(input)).toMatchObject({
      valid: true,
      allowed: false,
      reason: 'implementer-lease-live',
      remediationOwner: 'implementer',
    });
    expect(
      resolveHostedHandoffAdmission({
        ...input,
        now: '2026-08-22T04:00:00Z',
      })
    ).toMatchObject({
      valid: true,
      allowed: true,
      reason: 'implementer-lease-expired',
    });
    expect(
      resolveHostedHandoffAdmission({
        ...input,
        liveHead: 'b'.repeat(40),
      })
    ).toMatchObject({
      valid: true,
      allowed: true,
      reason: 'stale-handoff-head',
    });
    expect(
      resolveHostedHandoffAdmission({
        ...input,
        comments: [
          receiptMarker('jovie-rolling-ci-handoff', {
            ...activeReceipt,
            status: 'handed-off',
          }),
        ],
      })
    ).toMatchObject({
      valid: true,
      allowed: true,
      reason: 'handoff-handed-off',
    });
    expect(
      resolveHostedHandoffAdmission({
        ...input,
        comments: ['<!-- jovie-rolling-ci-handoff:not-json -->'],
      })
    ).toMatchObject({
      valid: false,
      allowed: false,
      reason: 'invalid-handoff-receipt',
    });
    expect(
      resolveHostedHandoffAdmission({ ...input, comments: [] })
    ).toMatchObject({
      valid: true,
      allowed: true,
      reason: 'no-handoff-receipt',
    });
  });

  it('invalidates all hosted receipts when trusted policy main advances', () => {
    expect(
      validateHostedPolicyBase({
        eventPolicySha: policyHead,
        currentMainSha: policyHead,
      })
    ).toMatchObject({ accepted: true, status: 'accepted' });
    expect(
      validateHostedPolicyBase({
        eventPolicySha: policyHead,
        currentMainSha: 'e'.repeat(40),
      })
    ).toMatchObject({
      accepted: false,
      status: 'blocked',
      reason: 'stale_policy_base',
    });

    const root = mkdtempSync(join(tmpdir(), 'jovie-policy-receipt-'));
    try {
      const output = join(root, 'policy.json');
      const result = spawnSync(
        process.execPath,
        [
          CLI,
          'hosted-policy',
          '--event-sha',
          policyHead,
          '--main-sha',
          'e'.repeat(40),
          '--output',
          output,
        ],
        { encoding: 'utf8' }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
        accepted: false,
        reason: 'stale_policy_base',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('admits only the marketing presentation zone and denies sensitive real paths', () => {
    expect(
      validateHostedRepairPath('apps/web/components/marketing/Hero.tsx').allowed
    ).toBe(true);
    for (const path of [
      '.github/workflows/ci.yml',
      'apps/web/lib/API_SECRET.ts',
      'apps/web/drizzle/migrations/001.sql',
      'apps/web/app/auth/callback.ts',
      'apps/web/lib/auth.ts',
      'apps/web/lib/oauth-client.ts',
      'apps/web/hooks/useJovieAuth.tsx',
      'apps/web/hooks/useIsAuthenticated.ts',
      'apps/web/lib/authorization.ts',
      'apps/web/lib/authorize-user.ts',
      'apps/web/components/providers/AuthClientProviders.tsx',
      'apps/web/app/billing/page.tsx',
      'apps/web/lib/billing.ts',
      'apps/web/lib/payment-client.ts',
      'apps/web/components/molecules/BillingPortalLink.tsx',
      'apps/web/components/organisms/BillingDashboard.tsx',
      'apps/web/lib/deployments/github.ts',
      'apps/web/components/providers/QueryProvider.tsx',
      'apps/web/lib/memory/graph-query.ts',
      'apps/web/lib/tasks/query-defaults.ts',
      'apps/web/app/openapi.json/route.ts',
      'apps/web/lib/migration.ts',
      'apps/web/lib/release.ts',
      'apps/web/lib/deploy.ts',
      'apps/web/proxy.ts',
      'apps/web/lib/deployment/release.ts',
      'apps/web/app/api/admin/users/route.ts',
      'apps/web/lib/db/queries.ts',
      'apps/web/lib/security/csp.ts',
      'apps/web/lib/supabase/admin.ts',
      'packages/core/src/permissions.ts',
      'apps/web/lib/unsafe).ts',
      'apps/web/tests/profile.test.ts',
      'scripts/lib/rolling-ci-fx.mjs',
    ]) {
      expect(validateHostedRepairPath(path), path).toMatchObject({
        allowed: false,
      });
    }
  });

  it('rejects a mixed original PR before prelaunch planning', () => {
    for (const deniedPath of [
      '.github/workflows/ci.yml',
      'package.json',
      'apps/web/hooks/useJovieAuth.tsx',
    ]) {
      expect(() =>
        buildHostedRepairPlan({
          dispatch: dispatch({ writer: 'fx-hosted' }),
          headRefName: 'codex/repair-proof',
          fileRecords: modifiedPullFiles(hostedPath, deniedPath),
          policySha: policyHead,
        })
      ).toThrow('original PR contains a path outside hosted repair policy');
    }
    expect(
      buildHostedRepairPlan({
        dispatch: dispatch({ writer: 'fx-hosted' }),
        headRefName: 'codex/repair-proof',
        fileRecords: modifiedPullFiles(
          hostedPath,
          'apps/web/components/marketing/Hero.tsx'
        ),
        policySha: policyHead,
      }).allowedPaths
    ).toEqual(['apps/web/components/marketing/Hero.tsx', hostedPath]);
  });

  it('rejects renamed or copied source transitions before prelaunch planning', () => {
    for (const status of ['renamed', 'copied']) {
      expect(() =>
        buildHostedRepairPlan({
          dispatch: dispatch({ writer: 'fx-hosted' }),
          headRefName: 'codex/repair-proof',
          fileRecords: [
            {
              filename: hostedPath,
              status,
              previous_filename: '.github/workflows/ci.yml',
            },
          ],
          policySha: policyHead,
        })
      ).toThrow(`original PR file transition ${status} is not eligible`);
    }

    expect(
      buildHostedRepairPlan({
        dispatch: dispatch({ writer: 'fx-hosted' }),
        headRefName: 'codex/repair-proof',
        fileRecords: modifiedPullFiles(hostedPath),
        policySha: policyHead,
      }).sourceFiles
    ).toEqual([{ filename: hostedPath, status: 'modified' }]);
  });

  it('rejects an untrusted symlink before executor invocation and accepts its quarantined control', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-hosted-candidate-'));
    try {
      const candidate = join(root, 'candidate');
      const external = join(root, 'runner-environment.txt');
      mkdirSync(dirname(join(candidate, hostedPath)), { recursive: true });
      writeFileSync(
        join(candidate, hostedPath),
        'export const proof = true;\n'
      );
      writeFileSync(external, 'CURSOR_API_KEY=must-not-be-read\n');
      mkdirSync(join(candidate, '.agents'), { recursive: true });
      symlinkSync(external, join(candidate, '.agents', 'rules'));
      const quarantine = join(root, 'quarantined-agents');
      renameSync(join(candidate, '.agents'), quarantine);
      mkdirSync(join(candidate, 'docs'), { recursive: true });
      symlinkSync(external, join(candidate, 'docs', 'context.md'));
      runGit(candidate, ['init', '--quiet']);
      runGit(candidate, ['add', '.']);

      expect(() =>
        validateHostedCandidateTree({
          repository: candidate,
          allowedPaths: [hostedPath],
        })
      ).toThrow('docs/context.md: candidate symlink is forbidden');

      rmSync(join(candidate, 'docs', 'context.md'));
      runGit(candidate, ['add', '--all']);
      expect(
        validateHostedCandidateTree({
          repository: candidate,
          allowedPaths: [hostedPath],
        })
      ).toMatchObject({
        schema: 'jovie-hosted-ci-candidate-tree/v1',
        accepted: true,
        allowedPaths: [hostedPath],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a candidate gitlink before executor invocation', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-hosted-gitlink-'));
    try {
      const candidate = join(root, 'candidate');
      mkdirSync(dirname(join(candidate, hostedPath)), { recursive: true });
      writeFileSync(
        join(candidate, hostedPath),
        'export const proof = true;\n'
      );
      runGit(candidate, ['init', '--quiet']);
      runGit(candidate, ['add', '.']);
      const tree = runGit(candidate, ['mktree'], { input: '' });
      const commit = runGit(candidate, ['commit-tree', tree, '-m', 'gitlink'], {
        env: {
          GIT_AUTHOR_NAME: 'Jovie Test',
          GIT_AUTHOR_EMAIL: 'test@jov.ie',
          GIT_COMMITTER_NAME: 'Jovie Test',
          GIT_COMMITTER_EMAIL: 'test@jov.ie',
        },
      });
      runGit(candidate, [
        'update-index',
        '--add',
        '--cacheinfo',
        `160000,${commit},vendor/untrusted`,
      ]);
      expect(() =>
        validateHostedCandidateTree({
          repository: candidate,
          allowedPaths: [hostedPath],
        })
      ).toThrow('vendor/untrusted: candidate gitlink is forbidden');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('applies only an exact-path unified diff through the trusted controller', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-hosted-proposal-'));
    try {
      mkdirSync(dirname(join(root, hostedPath)), { recursive: true });
      writeFileSync(join(root, hostedPath), 'export const proof = false;\n');
      writeFileSync(
        join(root, hostedOutsidePath),
        'export const outside = false;\n'
      );
      runGit(root, ['init', '--quiet']);
      runGit(root, ['add', '.']);
      runGit(root, ['commit', '--quiet', '-m', 'base'], {
        env: {
          GIT_AUTHOR_NAME: 'Jovie Test',
          GIT_AUTHOR_EMAIL: 'test@jov.ie',
          GIT_COMMITTER_NAME: 'Jovie Test',
          GIT_COMMITTER_EMAIL: 'test@jov.ie',
        },
      });
      const baseHead = runGit(root, ['rev-parse', 'HEAD']);
      const plan = buildHostedRepairPlan({
        dispatch: dispatch({
          writer: 'fx-hosted',
          headSha: baseHead,
          liveHead: baseHead,
          checks: [
            {
              name: 'ci-fast',
              conclusion: 'failure',
              headSha: baseHead,
              checkSuiteId: 44,
            },
          ],
        }),
        headRefName: 'codex/repair-proof',
        fileRecords: modifiedPullFiles(hostedPath),
        policySha: policyHead,
      });
      const proposal = Buffer.from(`diff --git a/${hostedPath} b/${hostedPath}
--- a/${hostedPath}
+++ b/${hostedPath}
@@ -1 +1 @@
-export const proof = false;
+export const proof = true;
`);
      expect(
        applyHostedPatchProposal({
          plan,
          repository: root,
          proposalBytes: proposal,
        })
      ).toMatchObject({
        schema: 'jovie-hosted-ci-proposal-apply/v1',
        applied: true,
        paths: [hostedPath],
      });
      expect(readFileSync(join(root, hostedPath), 'utf8')).toBe(
        'export const proof = true;\n'
      );

      runGit(root, ['restore', '--', hostedPath]);
      const outsideProposal = Buffer.from(
        `diff --git a/${hostedOutsidePath} b/${hostedOutsidePath}\n--- a/${hostedOutsidePath}\n+++ b/${hostedOutsidePath}\n@@ -1 +1 @@\n-export const outside = false;\n+export const outside = true;\n`
      );
      expect(() =>
        applyHostedPatchProposal({
          plan,
          repository: root,
          proposalBytes: outsideProposal,
        })
      ).toThrow('proposal path is outside planned authority');
      expect(() =>
        applyHostedPatchProposal({
          plan,
          repository: root,
          proposalBytes: Buffer.from(`prose\n${proposal}`),
        })
      ).toThrow('not a bounded UTF-8 git patch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds tested artifact bytes to an atomic expected-head update', () => {
    const { plan, acceptance, patchBytes, fileBytes, changes } =
      hostedFixture();
    expect(
      verifyHostedRepairFiles({
        plan,
        changes,
        fileContents: { [hostedPath]: fileBytes },
      })
    ).toMatchObject({
      verified: true,
      changedFiles: [hostedPath],
    });
    expect(() =>
      verifyHostedRepairFiles({
        plan,
        changes,
        fileContents: {
          [hostedPath]: Buffer.from('different untested contents'),
        },
      })
    ).toThrow('tested file hash mismatch');

    const outsideOriginalPr = {
      ...changes[0],
      path: hostedOutsidePath,
    };
    expect(() =>
      verifyHostedRepairFiles({
        plan,
        changes: [outsideOriginalPr],
        fileContents: {
          [outsideOriginalPr.path]: fileBytes,
        },
      })
    ).toThrow('path was not changed by the original PR');
    const variables = buildHostedCommitVariables({
      plan,
      acceptance,
      gateReceipt,
      patchBytes,
      fileContents: { [hostedPath]: fileBytes },
      now: new Date('2026-08-29T20:02:00.000Z'),
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
        path: hostedPath,
        contents: fileBytes.toString('base64'),
      },
    ]);
    expect(() =>
      buildHostedCommitVariables({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: {
          [hostedPath]: Buffer.from('tampered'),
        },
        now: new Date('2026-08-29T20:02:00.000Z'),
      })
    ).toThrow('immutable artifact hash mismatch');
  });

  it('rejects executor receipts outside the exact reviewed Cursor artifact', () => {
    const { plan, patchBytes, changes } = hostedFixture();
    const executor = {
      kind: 'cursor-cli',
      archiveUrl: HOSTED_CURSOR_ARCHIVE_URL,
      archiveSha256: HOSTED_CURSOR_ARCHIVE_SHA256,
      binarySha256: 'f'.repeat(64),
      version: HOSTED_CURSOR_VERSION,
    };
    for (const altered of [
      { ...executor, archiveUrl: `${HOSTED_CURSOR_ARCHIVE_URL}?moving=true` },
      { ...executor, archiveSha256: '0'.repeat(64) },
      { ...executor, version: 'latest' },
      { ...executor, binarySha256: '' },
    ]) {
      expect(() =>
        buildHostedAcceptanceReceipt({
          plan,
          gateReceipt,
          patchBytes,
          changes,
          executor: altered,
          now: new Date('2026-08-29T20:01:00.000Z'),
        })
      ).toThrow('executor identity is missing or malformed');
    }
  });

  it('CLI refuses tested files outside the original pull-request file set', () => {
    const { plan, fileBytes } = hostedFixture();
    const root = mkdtempSync(join(tmpdir(), 'jovie-hosted-verify-'));
    try {
      const candidate = join(root, 'candidate');
      const outsidePath = hostedOutsidePath;
      const fullPath = join(candidate, outsidePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, fileBytes);
      const planPath = join(root, 'plan.json');
      const changesPath = join(root, 'changes.json');
      const outputPath = join(root, 'receipt.json');
      writeFileSync(planPath, JSON.stringify(plan));
      writeFileSync(
        changesPath,
        JSON.stringify([
          {
            path: outsidePath,
            status: 'M',
            symlink: false,
            bytes: fileBytes.length,
            sha256: createHash('sha256').update(fileBytes).digest('hex'),
          },
        ])
      );

      const result = spawnSync(
        process.execPath,
        [
          CLI,
          'hosted-verify-tree',
          '--plan',
          planPath,
          '--repository',
          candidate,
          '--changes',
          changesPath,
          '--output',
          outputPath,
        ],
        { encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'path was not changed by the original PR'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('performs one real timed-out CI to atomic-repair transition', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
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
      if (path.includes('/actions/runs?')) {
        return {
          workflow_runs: [
            {
              id: 9001,
              run_attempt: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              event: 'pull_request',
              head_sha: head,
              status: 'completed',
              conclusion: 'timed_out',
            },
          ],
        };
      }
      if (path.endsWith('/commits/main')) {
        return { sha: policyHead };
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
      gateReceipt,
      patchBytes,
      fileContents: { [hostedPath]: fileBytes },
      readToken: 'read-token',
      writeToken: 'write-token',
      now: new Date('2026-08-29T20:02:00.000Z'),
      request,
    });
    expect(result).toMatchObject({
      committed: true,
      outcome: 'candidate_committed',
      committedHeadOid: 'b'.repeat(40),
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('rejects a cancelled latest run before GraphQL mutation', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async path => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
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
      if (path.includes('/actions/runs?')) {
        return {
          workflow_runs: [
            {
              id: 9001,
              run_attempt: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              event: 'pull_request',
              head_sha: head,
              status: 'completed',
              conclusion: 'cancelled',
            },
          ],
        };
      }
      throw new Error(`unexpected mutation request: ${path}`);
    });
    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { [hostedPath]: fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        now: new Date('2026-08-29T20:02:00.000Z'),
        request,
      })
    ).resolves.toEqual({ committed: false, outcome: 'stale_head' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('never reaches GraphQL when main advances after the tested receipt', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async path => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
          base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
          head: {
            ref: 'codex/repair-proof',
            sha: head,
            repo: { full_name: 'JovieInc/Jovie', fork: false },
          },
        };
      }
      if (path.includes('/actions/runs?')) {
        return {
          workflow_runs: [
            {
              id: 9001,
              run_attempt: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              event: 'pull_request',
              head_sha: head,
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        };
      }
      if (path.endsWith('/commits/main')) return { sha: 'e'.repeat(40) };
      throw new Error(`unexpected mutation request: ${path}`);
    });
    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { [hostedPath]: fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        now: new Date('2026-08-29T20:02:00.000Z'),
        request,
      })
    ).resolves.toEqual({
      committed: false,
      outcome: 'stale_policy_base',
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('aborts a green exact head before the writer and never calls GraphQL', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async path => {
      if (path.endsWith('/pulls/17')) {
        return {
          state: 'open',
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
      return {
        workflow_runs: [
          {
            id: 9002,
            run_attempt: 2,
            name: 'CI',
            path: '.github/workflows/ci.yml',
            event: 'pull_request',
            head_sha: head,
            status: 'completed',
            conclusion: 'success',
          },
        ],
      };
    });
    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { [hostedPath]: fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        now: new Date('2026-08-29T20:02:00.000Z'),
        request,
      })
    ).resolves.toEqual({ committed: false, outcome: 'superseded_green' });
    expect(request).toHaveBeenCalledTimes(2);
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
      outcome: 'candidate_committed',
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
    ).toEqual({
      live: false,
      state: 'terminal',
      outcome: 'candidate_committed',
    });
    expect(terminal.status).toBe('awaiting_verification');
  });

  it('promotes only the trusted candidate committed at the exact green head', () => {
    const { plan, acceptance } = hostedFixture();
    const committedHead = 'b'.repeat(40);
    const candidate = buildHostedTerminalReceipt({
      plan,
      acceptance,
      outcome: 'candidate_committed',
      committedHeadOid: committedHead,
      now: new Date('2026-08-29T20:03:00.000Z'),
    });
    const commentBody = `<!-- jovie-hosted-ci-terminal-receipt:${Buffer.from(
      JSON.stringify(candidate)
    ).toString('base64')} -->`;
    const input = {
      commentAuthor: 'github-actions[bot]',
      commentBody,
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      greenHead: committedHead,
      policySha: policyHead,
      workflowRunId: '9002',
      workflowRunAttempt: 2,
      checkSuiteId: '45',
      now: new Date('2026-08-29T20:05:00.000Z'),
    };

    expect(promoteHostedCandidateReceipt(input)).toMatchObject({
      promoted: true,
      receipt: {
        status: 'completed',
        outcome: 'repaired',
        committedHeadOid: committedHead,
        verification: {
          workflow: 'CI',
          conclusion: 'success',
          headOid: committedHead,
          policySha: policyHead,
          workflowRunId: '9002',
          workflowRunAttempt: 2,
          checkSuiteId: '45',
          runUrl:
            'https://github.com/JovieInc/Jovie/actions/runs/9002/attempts/2',
        },
      },
    });
    expect(
      promoteHostedCandidateReceipt({
        ...input,
        greenHead: 'c'.repeat(40),
      })
    ).toEqual({ promoted: false, reason: 'candidate-identity-mismatch' });
    expect(
      promoteHostedCandidateReceipt({
        ...input,
        commentAuthor: 'attacker',
      })
    ).toEqual({ promoted: false, reason: 'untrusted-comment-author' });
    expect(
      promoteHostedCandidateReceipt({
        ...input,
        policySha: 'e'.repeat(40),
      })
    ).toEqual({ promoted: false, reason: 'candidate-identity-mismatch' });
  });

  it('preserves typed freshness outcomes ahead of downstream job labels', () => {
    const failedModelFreshness = {
      prelaunchGateResult: 'success',
      prepareResult: 'failure',
      prepareTerminalOutcome: 'stale_policy_base',
      testResult: 'skipped',
      writeGateResult: 'skipped',
    };
    expect(resolveHostedTerminalOutcome(failedModelFreshness)).toBe(
      'stale_policy_base'
    );
    expect(
      resolveHostedTerminalOutcome({
        ...failedModelFreshness,
        prepareTerminalOutcome: '',
        testResult: 'failure',
        testTerminalOutcome: 'stale_policy_base',
      })
    ).toBe('stale_policy_base');
    expect(
      resolveHostedTerminalOutcome({
        ...failedModelFreshness,
        prepareTerminalOutcome: 'capacity_denied',
      })
    ).toBe('capacity_denied');
    expect(
      resolveHostedTerminalOutcome({
        ...failedModelFreshness,
        prepareTerminalOutcome: '',
      })
    ).toBe('executor_failed');
    expect(
      resolveHostedTerminalOutcome({
        ...failedModelFreshness,
        prepareTerminalOutcome: 'capacity_denied',
        testTerminalOutcome: 'stale_policy_base',
      })
    ).toBe('stale_policy_base');
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

  it('keeps merge_group outside hosted repair authority', () => {
    const mergeDispatch = dispatch({
      writer: FX_ADAPTER_NAME,
      source: { ...trustedSource, producerEvent: 'merge_group' },
    });
    expect(() =>
      buildHostedRepairPlan({
        dispatch: mergeDispatch,
        headRefName: 'codex/merge-group-source',
        fileRecords: modifiedPullFiles(hostedPath),
        policySha: policyHead,
      })
    ).toThrow('invalid hosted repair plan authority');
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

  it('deduplicates when a Cursor agent already owns the fingerprint', () => {
    const events = normalizeFailureEvents({
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      policySha: policyHead,
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

  it('terminalizes merge_group diagnostics even when remote mutation is requested', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 16418,
      headSha: head,
      policySha: policyHead,
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
      writer: 'tim',
      priorCommentBody: '',
      conclusion: 'failure',
      listCursorAgents: false,
      remoteMutationAllowed: true,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status, launched.stderr).toBe(0);
    expect(JSON.parse(launched.stdout)).toMatchObject({
      dispatch: {
        action: 'terminal_configuration_incident',
        mutate: true,
      },
      launch: {
        action: 'configuration_incident',
        reason: 'fx-safe-executor-unavailable',
        receipt: { remoteMutationAllowed: false },
      },
      outcome: 'blocked_executor',
    });
  });

  it('CLI fails closed instead of launching a remote-writing FX executor', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      policySha: policyHead,
      liveHead: head,
      headRef: 'fix/ci',
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
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).toBe(0);
    expect(JSON.parse(launched.stdout)).toMatchObject({
      route: { route: 'fx' },
      launch: {
        action: 'configuration_incident',
        reason: 'fx-safe-executor-unavailable',
      },
      dispatch: { mutate: true, action: 'terminal_configuration_incident' },
      outcome: 'blocked_executor',
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
    expect(
      resolveFxNamedOutcome({
        dispatch: { action: 'supersede_repairs_green' },
      })
    ).toBe('repaired');
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
      policySha: policyHead,
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
