import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  assertCredentialFreeHostedAcceptance,
  buildHostedAcceptanceReceipt,
  buildHostedCommitVariables,
  buildHostedRepairPlan,
  buildHostedTestReceipt,
  commitHostedRepair,
  HOSTED_REPAIR_NODE_COMMAND,
  HOSTED_REPAIR_POLICY_VERSION,
  hostedRepairTestCommands,
  runHostedVerification,
  validateHostedGateAdmission,
  validateHostedRepairPath,
} from '../rolling-ci-hosted-writer.mjs';

const head = 'a'.repeat(40);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const ok = command => ({ ...command, exitCode: 0 });
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
    gem: { maxConcurrent: 4, evidenceAccepted: true, newMutationAllowed: true },
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

function fixture(overrides = {}) {
  const plan = buildHostedRepairPlan({
    dispatch: dispatch(overrides.event),
    headRefName: 'codex/repair-proof',
    trustedPolicyOid: head,
  });
  const patchBytes = Buffer.from(
    'diff --git a/apps/web/lib/proof.ts b/apps/web/lib/proof.ts\n'
  );
  const fileBytes =
    overrides.fileBytes ?? Buffer.from('export const repaired = true;\n');
  const changes = overrides.changes ?? [
    {
      path: 'apps/web/lib/proof.ts',
      status: 'M',
      symlink: false,
      bytes: fileBytes.length,
      sha256: sha256(fileBytes),
    },
  ];
  const testReceipt = buildHostedTestReceipt({
    plan,
    patchBytes,
    changes,
    results: hostedRepairTestCommands(plan, changes).map(ok),
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
  return { plan, patchBytes, fileBytes, changes, testReceipt, acceptance };
}

function livePr(overrides = {}) {
  return {
    state: 'open',
    labels: [],
    base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
    head: {
      ref: 'codex/repair-proof',
      sha: head,
      repo: { full_name: 'JovieInc/Jovie', fork: false },
    },
    ...overrides,
  };
}

function failedCiRequest(pr = livePr()) {
  return vi.fn(async (path, options) => {
    if (path.endsWith('/pulls/17')) return pr;
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

function commitArgs(fx, overrides = {}) {
  return {
    plan: fx.plan,
    acceptance: fx.acceptance,
    gateReceipt,
    patchBytes: fx.patchBytes,
    fileContents: { 'apps/web/lib/proof.ts': fx.fileBytes },
    readToken: 'read-token',
    writeToken: 'write-token',
    clock: () => new Date('2026-08-29T20:02:00.000Z'),
    ...overrides,
  };
}

describe('hosted rolling CI repair policy', () => {
  it('plans exact-head repair with policy idempotency', () => {
    const { plan } = fixture();
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
        dispatch: dispatch({ repository: 'JovieInc/LogYourBody' }),
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

  it('requires typed gate capacity and denies sensitive paths', () => {
    expect(
      validateHostedGateAdmission({
        receipt: gateReceipt,
        trustedPolicyOid: head,
        now: new Date('2026-08-29T20:04:59.000Z'),
      })
    ).toMatchObject({ accepted: true, maxConcurrent: 1 });
    for (const receipt of [
      gateReceipt,
      {
        ...gateReceipt,
        remediationAdmission: {
          ...gateReceipt.remediationAdmission,
          pushAllowed: false,
          maxConcurrent: 0,
        },
      },
      { ...gateReceipt, signals: { main: { sha: 'b'.repeat(40) } } },
    ]) {
      expect(
        validateHostedGateAdmission({
          receipt,
          trustedPolicyOid: head,
          now: new Date('2026-08-29T20:05:01.000Z'),
        }).accepted
      ).toBe(false);
    }
    const allowed = validateHostedRepairPath('apps/web/lib/profile.ts').allowed;
    expect(allowed).toBe(true);
    for (const path of [
      '.github/workflows/ci.yml',
      'apps/web/drizzle/migrations/001.sql',
      'apps/web/app/(auth)/signin/page.tsx',
      'apps/web/app/@auth/(.)signin/page.tsx',
      'apps/web/app/billing/page.tsx',
      'apps/web/lib/deployments/github.ts',
      'apps/web/lib/entitlements.ts',
      'apps/web/tests/profile.test.ts',
      'scripts/lib/rolling-ci-fx.mjs',
    ]) {
      const policy = validateHostedRepairPath(path);
      expect(policy, path).toMatchObject({ allowed: false });
    }
  });

  it('binds bytes and stable commands to commit variables', () => {
    const { plan, acceptance, patchBytes, fileBytes, changes, testReceipt } =
      fixture();
    expect(hostedRepairTestCommands(plan, changes)[2].command).toBe(
      HOSTED_REPAIR_NODE_COMMAND
    );
    expect(
      buildHostedCommitVariables({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        now: new Date('2026-08-29T20:02:00.000Z'),
      }).input
    ).toMatchObject({
      branch: { repositoryNameWithOwner: 'JovieInc/Jovie' },
      expectedHeadOid: head,
    });
    expect(() =>
      buildHostedCommitVariables({
        plan,
        acceptance,
        gateReceipt,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': Buffer.from('tampered') },
        now: new Date('2026-08-29T20:02:00.000Z'),
      })
    ).toThrow('immutable artifact hash mismatch');
    const wrongBytes = [
      {
        ...changes[0],
        bytes: fileBytes.length + 1,
      },
    ];
    const wrongAcceptance = buildHostedAcceptanceReceipt({
      plan,
      gateReceipt,
      patchBytes,
      changes: wrongBytes,
      executor: acceptance.executor,
      testReceipt: buildHostedTestReceipt({
        plan,
        patchBytes,
        changes: wrongBytes,
        results: hostedRepairTestCommands(plan, wrongBytes).map(ok),
        now: new Date('2026-08-29T20:01:00.000Z'),
      }),
      now: new Date('2026-08-29T20:01:00.000Z'),
    });
    expect(() =>
      buildHostedCommitVariables({
        plan,
        acceptance: wrongAcceptance,
        gateReceipt,
        patchBytes,
        fileContents: { 'apps/web/lib/proof.ts': fileBytes },
        now: new Date('2026-08-29T20:02:00.000Z'),
      })
    ).toThrow('immutable artifact byte count mismatch');
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

  it('revalidates PR, labels, CI, and fresh gate before GraphQL', async () => {
    const fx = fixture();
    expect(() =>
      buildHostedAcceptanceReceipt({
        plan: fx.plan,
        gateReceipt,
        patchBytes: fx.patchBytes,
        changes: fx.acceptance.changedFiles,
        executor: fx.acceptance.executor,
        testReceipt: fx.acceptance.tests,
        now: new Date('2026-08-29T20:40:00.000Z'),
      })
    ).not.toThrow();
    await expect(
      commitHostedRepair(commitArgs(fx, { request: failedCiRequest() }))
    ).resolves.toMatchObject({ committed: true, outcome: 'repaired' });
    const heldPr = livePr({ labels: [{ name: 'needs-human' }] });
    await expect(
      commitHostedRepair(commitArgs(fx, { request: failedCiRequest(heldPr) }))
    ).resolves.toEqual({ committed: false, outcome: 'human_held' });
    await expect(
      commitHostedRepair(
        commitArgs(fx, {
          clock: () => new Date('2026-08-29T20:06:00.000Z'),
          request: failedCiRequest(),
        })
      )
    ).rejects.toThrow('fresh-typed-capacity-not-admitted');
  });

  it('scrubs credentials, re-inspects candidates, and wires workflow', () => {
    const { plan, patchBytes, changes } = fixture();
    const inspect = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('post-command mutation');
      });
    expect(() =>
      runHostedVerification({
        plan,
        patchBytes,
        changes,
        repository: '/candidate',
        environment: { PATH: '/bin', GH_TOKEN: 'write', STATUS_TOKEN: 'read' },
        execute: vi.fn((_command, _args, options) => {
          expect(options.env).toEqual({ PATH: '/bin' });
        }),
        inspect,
      })
    ).toThrow('post-command mutation');
    const credentials = { GH_TOKEN: 'writer' };
    expect(() => assertCredentialFreeHostedAcceptance(credentials)).toThrow(
      'before writer credentials exist'
    );
    const workflowPath = '.github/workflows/rolling-ci-dispatch.yml';
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('scripts/lib/rolling-ci-hosted-writer.mjs');
    expect(workflow).toContain('hosted-acceptance');
    expect(workflow).toContain('hosted-commit');
  });
});
