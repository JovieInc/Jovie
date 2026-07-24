import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const productionReleaseWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/production-release.yml'
);
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
  it('isolates staging provenance attestation and gates release mutation on its digest', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const deployJob = getJobBlock(workflow, 'deploy-staging');
    const attestationJob = getJobBlock(workflow, 'attest-staging-build');
    const stagingHeadJob = getJobBlock(workflow, 'staging-head');
    const aliasJob = getJobBlock(workflow, 'alias-staging');
    const promoteJob = getJobBlock(workflow, 'promote-production');
    const buildStep = getStepBlock(
      deployJob,
      'Build (preview target for staging verification)'
    );
    const hashStep = getStepBlock(
      deployJob,
      'Hash fixed staging build subject for isolated attestation'
    );
    const validateSubjectStep = getStepBlock(
      attestationJob,
      'Validate exact attestation subject'
    );
    const attestStep = getStepBlock(attestationJob, 'Attest build provenance');
    const deployStep = getStepBlock(
      deployJob,
      'Deploy (staging preview, prebuilt)'
    );

    expect(deployJob).toContain(
      'attestation_subject_name: ${{ steps.build-subject.outputs.subject_name }}'
    );
    expect(deployJob).toContain(
      'attestation_subject_digest: ${{ steps.build-subject.outputs.subject_digest }}'
    );
    expect(deployJob).not.toContain('attestations: write');
    expect(deployJob).not.toContain('id-token: write');

    const buildIndex = deployJob.indexOf(
      '- name: Build (preview target for staging verification)'
    );
    const hashIndex = deployJob.indexOf(
      '- name: Hash fixed staging build subject for isolated attestation'
    );
    const deployIndex = deployJob.indexOf(
      '- name: Deploy (staging preview, prebuilt)'
    );
    const validateSubjectIndex = attestationJob.indexOf(
      '- name: Validate exact attestation subject'
    );
    const attestIndex = attestationJob.indexOf(
      '- name: Attest build provenance'
    );

    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(hashIndex).toBeGreaterThan(buildIndex);
    expect(deployIndex).toBeGreaterThan(hashIndex);
    expect(validateSubjectIndex).toBeGreaterThanOrEqual(0);
    expect(attestIndex).toBeGreaterThan(validateSubjectIndex);

    expect(buildStep).toContain('vercel build');
    expect(hashStep).toContain(
      "subject_name='jovie-vercel-staging-build-output.tgz'"
    );
    expect(hashStep).toContain('subject_path="$RUNNER_TEMP/$subject_name"');
    expect(hashStep).toContain('tar -czf "$subject_path" -C . .vercel/output');
    expect(hashStep).toContain('digest="$(sha256sum "$subject_path"');
    expect(hashStep).toContain('[[ "$digest" =~ ^[0-9a-f]{64}$ ]]');
    expect(hashStep).toContain('echo "subject_digest=sha256:$digest"');
    expect(hashStep).not.toContain('/tmp/vercel-build-output.tar.gz');
    expect(deployStep).toContain('vercel-prebuilt-deploy.sh');

    expect(attestationJob).toContain('needs: [deploy-staging]');
    expect(attestationJob).toContain(
      'permissions:\n      contents: read\n      attestations: write\n      id-token: write'
    );
    const writePermissions = [
      ...attestationJob.matchAll(/^\s+([a-z-]+): write$/gm),
    ].map(match => match[1]);
    expect(writePermissions).toEqual(['attestations', 'id-token']);
    expect(attestationJob).not.toContain('write-all');
    expect(attestationJob).not.toContain('actions/checkout@');
    expect(attestationJob).not.toContain('setup-doppler');
    expect(attestationJob).not.toMatch(/\$\{\{\s*secrets(?:\.|\[)/);
    expect(attestationJob).not.toMatch(/^\s+secrets:/m);
    expect(attestationJob).not.toContain('DOPPLER_');

    expect(validateSubjectStep).toContain(
      'SUBJECT_NAME: ${{ needs.deploy-staging.outputs.attestation_subject_name }}'
    );
    expect(validateSubjectStep).toContain(
      'SUBJECT_DIGEST: ${{ needs.deploy-staging.outputs.attestation_subject_digest }}'
    );
    expect(validateSubjectStep).toContain(
      '[ "$SUBJECT_NAME" = \'jovie-vercel-staging-build-output.tgz\' ]'
    );
    expect(validateSubjectStep).toContain(
      '[[ "$SUBJECT_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]'
    );
    // Assert the action is pinned to a full 40-char commit SHA (the security
    // property this guardrail protects) without hardcoding a specific SHA, so
    // dependabot pin bumps don't deterministically redden the merge gate (#12425).
    expect(attestStep).toMatch(
      /^\s*uses: actions\/attest-build-provenance@[0-9a-f]{40}(?:\s+#.*)?\s*$/m
    );
    expect(attestStep).toContain(
      'subject-name: ${{ steps.subject.outputs.subject_name }}'
    );
    expect(attestStep).toContain(
      'subject-digest: ${{ steps.subject.outputs.subject_digest }}'
    );
    expect(attestStep).not.toContain('subject-path:');

    // Canary and attestation run in parallel, then staging-head joins both
    // before any shared alias or production mutation can proceed.
    expect(stagingHeadJob).toContain(
      'needs: [deploy-staging, attest-staging-build, canary-health-gate]'
    );
    expect(stagingHeadJob).toContain(
      "needs.attest-staging-build.result == 'success'"
    );
    expect(aliasJob).toContain(
      'needs: [deploy-staging, canary-health-gate, staging-head]'
    );
    expect(promoteJob).toContain(
      'needs: [deploy-staging, attest-staging-build, canary-health-gate, alias-staging, production-head]'
    );
    expect(promoteJob).toContain(
      "needs.attest-staging-build.result == 'success'"
    );
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

  it('keeps commit signing audit-only until an explicit live cutover', () => {
    const ruleset = readFileSync(branchProtectionPath, 'utf8');

    expect(ruleset).not.toMatch(
      /^\s*-\s*type:\s*['"]required_signatures['"]\s*$/m
    );
    expect(ruleset).toContain('Dormant rules are intentionally absent');
    expect(ruleset).toContain("include:\n      - 'refs/heads/main'");
  });
});
