import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/runner-autoscaler-canary.yml'),
  'utf8'
);

describe('runner autoscaler canary workflow', () => {
  it('is manual-only and targets the production autoscaler label', () => {
    const triggerBlock = workflow.match(/on:\n(?<block>[\s\S]*?)\npermissions:/)
      ?.groups?.block;

    expect(triggerBlock).toContain('workflow_dispatch:');
    expect(triggerBlock).not.toContain('push:');
    expect(triggerBlock).not.toContain('pull_request:');
    expect(workflow).toContain(
      'runs-on: [self-hosted, Linux, X64, "${{ \'jovie-ephemeral\' }}"]'
    );
  });

  it('requires an ephemeral autoscaler identity and does not persist credentials', () => {
    expect(workflow).toContain('jovie-eph-*');
    expect(workflow).toContain('persist-credentials: false');
  });
});
