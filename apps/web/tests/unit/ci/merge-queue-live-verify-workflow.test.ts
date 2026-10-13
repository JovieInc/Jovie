import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cronGapMinutes,
  filterList,
  triggerNames,
  workflowTriggers,
} from '../../../../../scripts/lib/workflow-triggers.mjs';

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
    const on = workflowTriggers(workflow);
    expect(triggerNames(on)).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(filterList(on.push.branches)).toEqual(['main']);
    // Every source the live verify reads re-runs it on main.
    expect(filterList(on.push.paths)).toEqual(
      expect.arrayContaining([
        '.github/rulesets/branch-protection.yml',
        'scripts/ci-merge-queue-check.mjs',
        'scripts/lib/merge-queue-guard.mjs',
      ])
    );
    expect(cronGapMinutes(on).max).toBeLessThanOrEqual(1440);
    expect(workflow).toContain('node scripts/ci-merge-queue-check.mjs verify');
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
