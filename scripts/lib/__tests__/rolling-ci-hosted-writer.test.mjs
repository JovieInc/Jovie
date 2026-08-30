import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertCredentialFreeHostedAcceptance,
  buildHostedAcceptanceReceipt,
  buildHostedCommitVariables,
  buildHostedRepairPlan,
  buildHostedTerminalReceipt,
  buildHostedTestReceipt,
  commitHostedRepair,
  HOSTED_REPAIR_POLICY_VERSION,
  hostedRepairTestCommands,
  isHostedRemediationSelfTrigger,
  readHostedArtifactFile,
  runHostedVerification,
  validateHostedAcceptance,
  validateHostedGateAdmission,
  validateHostedRepairPath,
} from '../rolling-ci-hosted-writer.mjs';

const head = 'a'.repeat(40);
const gateReceipt = {
  schema: 'jovie-fleet-gate/v1',
  observedAt: '2026-08-29T20:00:00.000Z',
  signals: { main: { sha: head } },
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

function dispatch(overrides = {}) {
  const event = {
    repository: 'JovieInc/Jovie',
    pr: 17,
    head,
    source: { producerEvent: 'pull_request' },
    workflowRunId: 9001,
    attempt: 1,
    checkSuiteId: 44,
    fingerprint: 'ci:policy-liveness',
    check: 'ci-fast',
    failedSteps: ['Typecheck'],
    ...overrides,
  };
  return {
    action: 'dispatch_implementer',
    mutate: true,
    events: [event],
    state: { claim: { fingerprint: event.fingerprint } },
  };
}

function hostedFixture() {
  const plan = buildHostedRepairPlan({
    dispatch: dispatch(),
    headRefName: 'codex/repair-proof',
    trustedPolicyOid: head,
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
  const testReceipt = buildHostedTestReceipt({
    plan,
    patchBytes,
    changes,
    results: hostedRepairTestCommands(plan, changes).map(command => ({
      ...command,
      exitCode: 0,
    })),
    now: new Date('2026-08-29T20:01:00.000Z'),
  });
  const acceptance = buildHostedAcceptanceReceipt({
    plan,
    gateReceipt,
    patchBytes,
    changes,
    executor: {
      kind: 'cursor-cli',
      installerSha256: 'f'.repeat(64),
      version: '2026.08.29',
    },
    testReceipt,
    now: new Date('2026-08-29T20:01:00.000Z'),
  });
  return { plan, patchBytes, fileBytes, changes, acceptance, testReceipt };
}

function failedCiRequest() {
  return vi.fn(async (path, options) => {
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
}

describe('hosted rolling CI repair policy', () => {
  it('plans one Jovie-only exact-head repair with policy-version idempotency', () => {
    const { plan } = hostedFixture();
    expect(plan).toMatchObject({
      schema: 'jovie-hosted-ci-repair-plan/v1',
      policyVersion: HOSTED_REPAIR_POLICY_VERSION,
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      expectedHeadOid: head,
      producerEvent: 'pull_request',
      maxConcurrent: 1,
    });
    expect(plan.idempotencyKey).toContain(plan.fingerprint);
    expect(plan.idempotencyKey).toContain(HOSTED_REPAIR_POLICY_VERSION);
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch({
          repository: 'JovieInc/LogYourBody',
        }),
        headRefName: 'codex/nope',
        trustedPolicyOid: head,
      })
    ).toThrow('invalid hosted repair plan authority');
    expect(() =>
      buildHostedRepairPlan({
        dispatch: dispatch(),
        headRefName: 'gh-readonly-queue/main/pr-17-deadbeef',
        trustedPolicyOid: head,
      })
    ).toThrow('main, synthetic, or not a safe branch ref');
  });

  it('requires a fresh typed gate and clamps effective concurrency to one', () => {
    expect(
      validateHostedGateAdmission({
        receipt: gateReceipt,
        trustedPolicyOid: head,
        now: new Date('2026-08-29T20:04:59.000Z'),
      })
    ).toMatchObject({ accepted: true, maxConcurrent: 1 });
    expect(
      validateHostedGateAdmission({
        receipt: gateReceipt,
        trustedPolicyOid: head,
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
        trustedPolicyOid: head,
        now: new Date('2026-08-29T20:01:00.000Z'),
      }).accepted
    ).toBe(false);
    expect(
      validateHostedGateAdmission({
        receipt: { ...gateReceipt, signals: { main: { sha: 'b'.repeat(40) } } },
        trustedPolicyOid: head,
        now: new Date('2026-08-29T20:01:00.000Z'),
      }).accepted
    ).toBe(false);
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

  it('binds tested artifact bytes to an atomic expected-head update', () => {
    const { plan, acceptance, patchBytes, fileBytes, changes, testReceipt } =
      hostedFixture();
    const variables = buildHostedCommitVariables({
      plan,
      acceptance,
      gateReceipt,
      patchBytes,
      fileContents: { 'apps/web/lib/proof.ts': fileBytes },
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
        path: 'apps/web/lib/proof.ts',
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
          'apps/web/lib/proof.ts': Buffer.from('tampered'),
        },
        now: new Date('2026-08-29T20:02:00.000Z'),
      })
    ).toThrow('immutable artifact hash mismatch');
    expect(() =>
      buildHostedTestReceipt({
        plan,
        patchBytes,
        changes,
        results: testReceipt.results.map((result, index) => ({
          ...result,
          exitCode: index === 2 ? 1 : 0,
        })),
      })
    ).toThrow('tests are missing, failing, or reordered');
  });

  it('never follows an executor-controlled artifact symlink', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-hosted-artifact-'));
    try {
      const root = join(directory, 'artifact');
      const outside = join(directory, 'outside.txt');
      mkdirSync(join(root, 'apps/web/lib'), { recursive: true, mode: 0o700 });
      writeFileSync(outside, 'runner secret');
      symlinkSync(outside, join(root, 'apps/web/lib/proof.ts'));
      expect(() =>
        readHostedArtifactFile(root, 'apps/web/lib/proof.ts')
      ).toThrow('symlink artifact is forbidden');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('performs one real failed-CI to atomic-repair transition', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = failedCiRequest();
    const result = await commitHostedRepair({
      plan,
      acceptance,
      gateReceipt,
      patchBytes,
      fileContents: { 'apps/web/lib/proof.ts': fileBytes },
      readToken: 'read-token',
      writeToken: 'write-token',
      clock: () => new Date('2026-08-29T20:02:00.000Z'),
      request,
    });
    expect(result).toMatchObject({
      committed: true,
      outcome: 'repaired',
      committedHeadOid: 'b'.repeat(40),
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('rechecks gate freshness after verification and before GraphQL', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = failedCiRequest();
    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        clock: () => new Date('2026-08-29T20:06:00.000Z'),
        request,
      })
    ).rejects.toThrow('fresh-typed-capacity-not-admitted');
    expect(request).toHaveBeenCalledTimes(2);
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
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        clock: () => new Date('2026-08-29T20:02:00.000Z'),
        request,
      })
    ).resolves.toEqual({ committed: false, outcome: 'superseded_green' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('expires stale acceptance and emits a terminal receipt', () => {
    const { plan, acceptance, patchBytes } = hostedFixture();
    expect(
      buildHostedTerminalReceipt({
        plan,
        acceptance,
        outcome: 'repaired',
        committedHeadOid: 'b'.repeat(40),
      })
    ).toMatchObject({ terminal: true, outcome: 'repaired' });
    expect(
      validateHostedAcceptance({
        plan,
        acceptance,
        patchBytes,
        gateReceipt: {
          ...gateReceipt,
          observedAt: '2026-08-29T20:46:00.000Z',
        },
        now: new Date('2026-08-29T20:47:00.000Z'),
      }).accepted
    ).toBe(false);
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
describe('hosted writer deliberate red', () => {
  it('deliberate red: blocks a moved PR head before GraphQL', async () => {
    const { plan, acceptance, patchBytes, fileBytes } = hostedFixture();
    const request = vi.fn(async path => {
      expect(path).toContain('/pulls/17');
      return {
        state: 'open',
        base: {
          ref: 'main',
          repo: { full_name: 'JovieInc/Jovie' },
        },
        head: {
          ref: 'codex/repair-proof',
          sha: 'c'.repeat(40),
          repo: { full_name: 'JovieInc/Jovie', fork: false },
        },
      };
    });

    await expect(
      commitHostedRepair({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        readToken: 'read-token',
        writeToken: 'write-token',
        clock: () => new Date('2026-08-29T20:02:00.000Z'),
        request,
      })
    ).resolves.toEqual({ committed: false, outcome: 'stale_head' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('scrubs credentials and re-inspects candidate bytes after commands', () => {
    const { plan, patchBytes, changes } = hostedFixture();
    const inspect = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('post-command mutation');
      });
    const execute = vi.fn((_command, _args, options) => {
      expect(options.env).toEqual({ PATH: '/bin' });
    });
    expect(() =>
      runHostedVerification({
        plan,
        patchBytes,
        changes,
        repository: '/candidate',
        environment: { PATH: '/bin', GH_TOKEN: 'write', STATUS_TOKEN: 'read' },
        execute,
        inspect,
      })
    ).toThrow('post-command mutation');
    expect(execute).toHaveBeenCalledTimes(3);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(() =>
      runHostedVerification({
        plan,
        patchBytes,
        changes,
        repository: '/candidate',
        execute: () => {
          throw new Error('command failed');
        },
        inspect: vi.fn(),
      })
    ).toThrow('command failed');
    expect(() =>
      assertCredentialFreeHostedAcceptance({ GH_TOKEN: 'writer' })
    ).toThrow('before writer credentials exist');
  });
});
