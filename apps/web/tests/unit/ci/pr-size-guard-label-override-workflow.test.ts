import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const overrideWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/pr-size-guard-label-override.yml'
);
const sizeGuardWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/pr-size-guard.yml'
);

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex(
    (line, index) => index > start && line.trim().startsWith('- name:')
  );

  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

describe('PR Size Guard label override workflow', () => {
  it('triggers only on labeled events without a concurrency group', () => {
    const workflow = readFileSync(overrideWorkflowPath, 'utf8');

    expect(workflow).toContain('types: [labeled]');
    expect(workflow).not.toContain('types: [opened, synchronize, reopened]');
    expect(workflow).not.toContain('concurrency:');
  });

  it('scopes the job to big-pr and codemod labels only', () => {
    const workflow = readFileSync(overrideWorkflowPath, 'utf8');

    expect(workflow).toContain('github.event.pull_request.head.repo.fork == false');
    expect(workflow).toContain("github.event.label.name == 'big-pr'");
    expect(workflow).toContain("github.event.label.name == 'codemod'");
  });

  it('posts a passing PR Size Guard check run via the Checks API', () => {
    const workflow = readFileSync(overrideWorkflowPath, 'utf8');
    const step = getStepBlock(
      workflow,
      'Post passing PR Size Guard check (opt-out label)'
    );

    expect(workflow).toContain('checks: write');
    expect(step).toContain('repos/$REPO/check-runs');
    expect(step).toContain("-f name='PR Size Guard'");
    expect(step).toContain("-f conclusion='success'");
    expect(step).toContain("-f status='completed'");
    expect(step).toContain('head_sha');
    expect(step).not.toContain('MAX_LINES');
    expect(step).not.toContain('.files[]');
  });

  it('keeps the main size guard on push-only events with concurrency', () => {
    const workflow = readFileSync(sizeGuardWorkflowPath, 'utf8');

    expect(workflow).toContain('types: [opened, synchronize, reopened]');
    expect(workflow).not.toContain('types: [labeled]');
    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain('pr-size-guard-label-override.yml');
  });
});