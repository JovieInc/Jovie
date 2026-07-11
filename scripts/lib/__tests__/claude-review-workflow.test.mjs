import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW_PATH = resolve(REPO_ROOT, '.github/workflows/claude-review.yml');
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

describe('Claude review workflow hygiene', () => {
  it('uses supported action inputs', () => {
    expect(workflow).toContain('client-id: ${{ vars.JOVIE_BOT_CLIENT_ID }}');
    expect(workflow).not.toMatch(/^\s+app-id:/m);
    expect(workflow).not.toMatch(/^\s+mcp_config:/m);
    expect(workflow).toContain(
      '--mcp-config ${{ runner.temp }}/claude-review-mcp.json'
    );
  });

  it('repairs skill discovery using the canonical tracked skill', () => {
    expect(workflow).toContain(
      "canonical_skill='.agents/skills/gstack/office-hours/SKILL.md'"
    );
    expect(workflow).toContain('test -f "$canonical_skill"');
    expect(workflow).toContain(
      'ln -s ../../../$canonical_skill .claude/skills/office-hours/SKILL.md'
    );
    expect(workflow).toContain('test -f .claude/skills/office-hours/SKILL.md');
  });

  it('keeps gbrain context and high-signal review requirements enabled', () => {
    const reviewStep = workflow.slice(
      workflow.indexOf('- name: Claude review')
    );

    expect(reviewStep).not.toContain('continue-on-error: true');
    expect(workflow).toContain('command: "bunx"');
    expect(workflow).toContain('args: ["gbrain", "serve"]');
    expect(workflow).toContain('COLLECTIVE CONTEXT FIRST');
    expect(workflow).toContain('BE HIGH-SIGNAL');
    expect(workflow).toContain('Post ONE concise PR review');
  });
});
