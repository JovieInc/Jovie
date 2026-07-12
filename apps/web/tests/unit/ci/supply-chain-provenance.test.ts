import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const ciWorkflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
const securityWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/security.yml'
);
const branchProtectionPath = resolve(
  repoRoot,
  '.github/rulesets/branch-protection.yml'
);

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];

  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;

    if (index > start && line.startsWith('      - name: ')) break;
    if (index > start && /^[a-zA-Z0-9_-]+:/.test(line)) break;

    block.push(line);
  }

  return block.join('\n');
}

function getJobBlock(workflow: string, jobKey: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);

  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];

  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;

    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;

    block.push(line);
  }

  return block.join('\n');
}

describe('supply chain provenance guardrails', () => {
  it('attests deploy-staging build output with SLSA provenance after vercel build', () => {
    const workflow = readFileSync(ciWorkflowPath, 'utf8');
    const deployJob = getJobBlock(workflow, 'deploy-staging');
    const buildStep = getStepBlock(
      workflow,
      'Build (preview target for staging verification)'
    );
    const packageStep = getStepBlock(
      workflow,
      'Package build output for provenance attestation'
    );
    const attestStep = getStepBlock(
      workflow,
      'Attest build provenance (SLSA Level 2)'
    );
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );

    expect(deployJob).toContain('attestations: write');
    expect(deployJob).toContain('id-token: write');

    const buildIndex = workflow.indexOf(
      '- name: Build (preview target for staging verification)'
    );
    const packageIndex = workflow.indexOf(
      '- name: Package build output for provenance attestation'
    );
    const attestIndex = workflow.indexOf(
      '- name: Attest build provenance (SLSA Level 2)'
    );
    const deployIndex = workflow.indexOf(
      '- name: Deploy (staging preview, prebuilt)'
    );

    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(packageIndex).toBeGreaterThan(buildIndex);
    expect(attestIndex).toBeGreaterThan(packageIndex);
    expect(deployIndex).toBeGreaterThan(attestIndex);

    expect(buildStep).toContain('vercel build');
    expect(workflow).toContain(
      'bash .github/scripts/package-vercel-build-output.sh'
    );
    expect(packageStep).toContain('/tmp/vercel-build-output.tar.gz');
    // Assert the action is pinned to a full 40-char commit SHA (the security
    // property this guardrail protects) without hardcoding a specific SHA, so
    // dependabot pin bumps don't deterministically redden the merge gate (#12425).
    expect(attestStep).toMatch(
      /^\s*uses: actions\/attest-build-provenance@[0-9a-f]{40}(?:\s+#.*)?\s*$/m
    );
    expect(attestStep).toContain(
      'subject-path: /tmp/vercel-build-output.tar.gz'
    );
    expect(deployStep).toContain('vercel-prebuilt-deploy.sh');
  });

  it('audits main commit signatures on every push via security workflow', () => {
    const workflow = readFileSync(securityWorkflowPath, 'utf8');
    const signatureJob = getJobBlock(workflow, 'commit-signature-check');
    const verifyStep = getStepBlock(workflow, 'Verify commit is signed');

    expect(signatureJob).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(verifyStep).toContain(
      'gh api "repos/${REPO}/commits/${COMMIT_SHA}"'
    );
    expect(verifyStep).toContain('.commit.verification.verified');
    expect(verifyStep).toContain('::warning title=Unsigned commit::');
  });

  it('requires signed commits on main in the branch protection ruleset source', () => {
    const ruleset = readFileSync(branchProtectionPath, 'utf8');

    expect(ruleset).toContain("type: 'required_signatures'");
    expect(ruleset).toContain("include:\n      - 'refs/heads/main'");
  });
});
