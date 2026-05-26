import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const workflowPath = resolve(repoRoot, '.github/workflows/scope-judge.yml');

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex(
    (line, index) => index > start && line.trim().startsWith('- name:')
  );

  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

describe('Scope Judge workflow cost controls', () => {
  it('posts a successful deterministic status when the LLM key is absent', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const step = getStepBlock(
      workflow,
      'Deterministic status (scope judge API key missing)'
    );

    expect(step).toContain("steps.judge-key.outputs.has_key != 'true'");
    expect(step).toContain('-f state="success"');
    expect(step).toContain('context="scope-judge"');
    expect(step).toContain('API key missing; no model call');
    expect(step).not.toContain('-f state="failure"');
    expect(step).not.toContain('OPENAI_API_KEY');
  });
});
