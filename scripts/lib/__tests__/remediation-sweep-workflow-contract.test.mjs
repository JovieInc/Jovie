import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/remediation-sweep.yml'),
  'utf8'
);
const SCRIPT = readFileSync(
  resolve(REPO_ROOT, 'scripts/remediation-sweep.mjs'),
  'utf8'
);

// JOV-7871: the summer-config sweep queries `statusCheckRollup`, which GitHub
// resolves through StatusContext nodes that require commit statuses read. The
// app token that only asks for checks/issues/pull-requests gets
// "Resource not accessible by integration" and the job exits 1.
describe('Remediation Sweep workflow contract', () => {
  it('reads summer-config pull requests including the status check rollup', () => {
    expect(SCRIPT).toContain('SUMMER_CONFIG_REPO');
    expect(SCRIPT).toMatch(
      /'--repo',\s*\n?\s*repo,\s*\n[\s\S]*?statusCheckRollup/
    );
  });

  it('grants the cross-repo token every permission the rollup needs', () => {
    const tokenStep = WORKFLOW.slice(
      WORKFLOW.indexOf('create-github-app-token'),
      WORKFLOW.indexOf('Resolve dry run')
    );
    expect(tokenStep).toContain('summer-config');
    for (const permission of [
      'checks',
      'issues',
      'pull-requests',
      'statuses',
    ]) {
      expect(tokenStep).toContain(`permission-${permission}: read`);
    }
  });
});
