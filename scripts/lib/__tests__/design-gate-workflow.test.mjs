import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '.github/workflows/design-gate.yml'
);

describe('design gate workflow', () => {
  it('lists changed paths from the merge commit, not the shared REST quota', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');
    const filesStep = workflow.slice(workflow.indexOf('- name: Changed files'));

    // 2026-10-21: the installation REST budget was exhausted and this job
    // failed before the brief check on pulls/<n>/files. The pull_request
    // checkout is the merge commit; depth 2 includes its first parent.
    expect(workflow).toContain('fetch-depth: 2');
    expect(filesStep).toContain('git diff --name-only');
    expect(filesStep).toContain('HEAD^1');
    expect(filesStep).not.toMatch(/\bgh (?:api|pr)\b/);
    expect(workflow).not.toContain('pulls/');
  });
});
