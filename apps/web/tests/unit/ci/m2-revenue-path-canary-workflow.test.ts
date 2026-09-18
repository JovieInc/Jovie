import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/m2-revenue-path-canary.yml'
);

describe('M2 revenue-path canary workflow (JOV-6439)', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  it('is a production-liveness clock with daily and deploy-hook triggers', () => {
    expect(workflow).toContain('# clock-class: production-liveness');
    expect(workflow).toContain(
      '# controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain('# accountable-writer: Gem');
    expect(workflow).toContain('# necessary-trust-boundary:');
    expect(workflow).toContain('# removal-trigger:');
    expect(workflow).toContain("- cron: '37 6 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('workflow_call:');
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('workflows: [Production Controller]');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('merge_group:');
  });

  it('is distinct from generic uptime and the existing canaries', () => {
    expect(workflow).toContain('Distinct from Canary Health Gate');
    expect(workflow).toContain('signed-out → claim → $199 Pro checkout → activation');
    expect(workflow).toContain('JOV-6439');
    expect(workflow).toContain(
      'pnpm --filter=@jovie/web exec tsx scripts/m2-revenue-path-canary.ts'
    );
    expect(workflow).not.toContain('canary-health-gate.yml');
    expect(workflow).not.toContain('synthetic-golden-path.spec.ts');
  });

  it('writes a receipt and files Linear plus Slack on red', () => {
    expect(workflow).toContain('--receipt');
    expect(workflow).toContain('m2-revenue-path-receipt.json');
    expect(workflow).toContain('scripts/m2-revenue-path-canary-intake.mjs');
    expect(workflow).toContain('LINEAR_API_KEY');
    expect(workflow).toContain('Slack alert on red');
    expect(workflow).toContain('File Linear issue on red');
  });

  it('pins checkout on main without credentials', () => {
    expect(workflow).toContain(
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
    );
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('contents: read');
  });
});
