import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('fork PR approval workflow', () => {
  it('keeps pull_request_target approval handling on a hosted runner', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '.github/workflows/fork-pr-gate.yml'),
      'utf8'
    );
    const approvalJob = workflow.slice(workflow.indexOf('  fork-gate:'));

    expect(workflow).toContain('pull_request_target:');
    expect(approvalJob).toContain('runs-on: ubuntu-latest');
    expect(approvalJob).not.toContain('CI_GATE_RUNNER');
  });
});
