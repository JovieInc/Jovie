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
  it('runs the LLM-backed judge through OpenRouter free models', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const keyStep = getStepBlock(workflow, 'Check scope judge API key');
    const judgeStep = getStepBlock(
      workflow,
      'Run scope alignment judge (OpenRouter)'
    );

    expect(keyStep).toContain('OPENROUTER_API_KEY');
    expect(keyStep).not.toContain('OPENAI_API_KEY');
    expect(judgeStep).toContain(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(judgeStep).toContain('OPENROUTER_API_KEY');
    expect(judgeStep).toContain('OPENROUTER_MODEL: openai/gpt-oss-20b:free');
    expect(judgeStep).not.toContain('https://api.openai.com');
    expect(judgeStep).not.toContain('gpt-4o-mini');
  });

  it('escapes judge reasons with shell metacharacters before reporting status', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const judgeStep = getStepBlock(
      workflow,
      'Run scope alignment judge (OpenRouter)'
    );
    const reportStep = getStepBlock(workflow, 'Report scope judge status');
    const commentStep = getStepBlock(
      workflow,
      'Comment on PR if scope creep detected'
    );

    expect(judgeStep).toContain('write_multiline_output reason "$REASON"');
    expect(judgeStep).not.toContain(
      'echo "reason=$REASON" >> "$GITHUB_OUTPUT"'
    );
    expect(reportStep).toContain(
      'JUDGE_REASON: ${{ steps.judge.outputs.reason }}'
    );
    expect(reportStep).not.toContain(
      'REASON="${{ steps.judge.outputs.reason }}"'
    );
    expect(commentStep).toContain(
      'JUDGE_REASON: ${{ steps.judge.outputs.reason }}'
    );
    expect(commentStep).not.toContain(
      'REASON="${{ steps.judge.outputs.reason }}"'
    );
  });

  it('posts a successful deterministic status when the LLM key is absent', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const step = getStepBlock(
      workflow,
      'Deterministic status (scope judge API key missing)'
    );

    expect(step).toContain("steps.judge-key.outputs.has_key != 'true'");
    expect(step).toContain('-f state="success"');
    expect(step).toContain('context="scope-judge"');
    expect(step).toContain('OpenRouter API key missing; no model call');
    expect(step).not.toContain('-f state="failure"');
    expect(step).not.toContain('OPENAI_API_KEY');
  });
});
