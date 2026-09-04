import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/merge-queue-ruleset-verify.yml'
);
const ciWorkflowPath = resolve(repoRoot, '.github/workflows/ci.yml');

describe('merge queue live verify workflow', () => {
  it('is the scheduled/main-push caller of live ruleset verify', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('# clock-class: upstream-advisory');
    expect(workflow).toContain('cron:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('node scripts/ci-merge-queue-check.mjs verify');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('merge_group:');
  });

  it('alerts Slack on failure without GitHub Issue intake', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('SLACK_WEBHOOK_URL');
    expect(workflow).toContain('failure()');
    expect(workflow).toContain('curl -sS -X POST');
    expect(workflow).not.toContain('issues: write');
    expect(workflow).not.toContain('gh issue create');
  });

  it('does not add live verify to source PR or merge-group CI', () => {
    const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');

    expect(ciWorkflow).not.toContain('ci:merge-queue:verify');
    expect(ciWorkflow).not.toContain('merge-queue-check.mjs verify');
  });
});
