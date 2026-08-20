import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/ci-duration-ratchet.yml'
);

describe('ci duration ratchet workflow', () => {
  it('alerts Slack when the p95 SLO check fails', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('node scripts/ci-duration-ratchet.mjs check');
    expect(workflow).toContain('Slack alert on failure');
    expect(workflow).toContain('failure()');
    expect(workflow).toContain('SLACK_WEBHOOK_URL');
    expect(workflow).toContain('curl -sS -X POST');
    expect(workflow).not.toContain('gh issue create');
  });
});
