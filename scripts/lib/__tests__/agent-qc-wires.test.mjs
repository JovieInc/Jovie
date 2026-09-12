import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PINNED_JOB_CONTEXTS } from '../merge-queue-guard.mjs';
import {
  ADVISORY_CHECK_NAMES,
  REQUIRED_CHECK_NAMES,
} from '../pr-check-failures.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function readRepo(relativePath) {
  return readFileSync(`${repoRoot}/${relativePath}`, 'utf8');
}

describe('agent QC wire honesty (JOV-5235)', () => {
  const pipeline = readRepo('.github/workflows/agent-pipeline.yml');
  const landing = readRepo('.github/workflows/agent-landing-sweep.yml');
  const slop = readRepo('.github/workflows/slop-gate.yml');
  const autoPr = readRepo('.github/workflows/auto-pr-on-push.yml');
  const architecture = readRepo('docs/AGENT_OS_ARCHITECTURE.md');

  it('retires the Scope Judge producer and stops advertising a passed gate', () => {
    expect(pipeline).not.toMatch(
      /workflows:\s*\[["']CI["'],\s*["']Scope Judge["']\]/
    );
    expect(pipeline).not.toContain('CI + Scope Judge both pass');
    expect(pipeline).not.toContain('context == "scope-judge"');
    expect(pipeline).not.toContain('[x] Scope judge');
    expect(landing).not.toContain('scope-judge-passed');
    expect(landing).not.toContain('Scope judge = success');
    expect(landing).not.toContain('context == "scope-judge"');
    expect(autoPr).not.toContain('scope judge');
    expect(architecture).toMatch(
      /github\.scope-judge.*retired|retired.*github\.scope-judge/i
    );
  });

  it('keeps Slop Gate post-merge informational and off PR Ready', () => {
    expect(slop).toMatch(/^\s*schedule:/m);
    expect(slop).toMatch(/^\s*workflow_dispatch:/m);
    expect(slop).not.toMatch(/^\s*pull_request(_target)?:/m);
    expect(slop).not.toMatch(/^\s*merge_group:/m);
    expect(slop).toMatch(/post-merge informational/i);
    expect(slop).not.toMatch(/flip to blocking/i);
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'Slop Gate (advisory)'
    );
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'Slop Gate'
    );
    expect(ADVISORY_CHECK_NAMES).toContain('Slop Gate (advisory)');
    expect(FORBIDDEN_PINNED_JOB_CONTEXTS).toEqual(
      expect.arrayContaining(['Slop Gate (advisory)', 'Slop Gate'])
    );
  });

  it('does not consume self-attested GStack comments for auto-approve', () => {
    expect(pipeline).not.toContain('check-agent-gate-evidence.ts');
    expect(pipeline).not.toContain('issues/$PR_NUMBER/comments');
    expect(pipeline).not.toContain('id: gstack-gates');
  });

  it('routes retry exhaustion to automation without creating a human hold', () => {
    expect(pipeline).not.toContain('scripts/lib/needs-human-autoclose.mjs');
    expect(pipeline).not.toMatch(/--add-label(?:=|\s+)["']?needs-human/);
    expect(pipeline).toContain('SLACK_WEBHOOK_URL');
    expect(pipeline).toContain('LINEAR_API_KEY');
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'needs-human'
    );
    expect(FORBIDDEN_PINNED_JOB_CONTEXTS).not.toContain('needs-human');
  });

  it('classifies agent-pipeline branches with the shared allowlist', () => {
    expect(pipeline).toContain('scripts/lib/agent-branch-pattern.mjs --match');
    expect(pipeline).not.toMatch(
      /\$BRANCH" =~ \^\(main\|dependabot\/\|gh-readonly-queue\/\|renovate\/\)/
    );
    expect(pipeline).not.toContain(
      'test("^(main|dependabot/|gh-readonly-queue/|renovate/)")'
    );
  });
});
