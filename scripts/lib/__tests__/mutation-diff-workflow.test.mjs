import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
  'utf8'
);

describe('Mutation Diff Gem contract', () => {
  // Policy 2026-10-29 (supersedes 2026-10-26 hosted-by-default): hosted CI is saturated, so every
  // job runs on the Gem jovie-fixed pool. The sweep preflight skips when Gem is short on capacity.
  it('runs every job on the Gem jovie-fixed pool and keeps the sweep state in an Actions cache', () => {
    const runsOn = [...workflow.matchAll(/^\s+runs-on:\s*(.+)$/gmu)].map(
      match => match[1].trim()
    );
    expect(runsOn).toHaveLength(2);
    for (const value of runsOn)
      expect(value).toBe('[self-hosted, Linux, X64, jovie-fixed]');
    expect(workflow).not.toMatch(/runs-on:\s*ubuntu/u);
    expect(workflow).toMatch(/actions\/cache\/restore@/u);
    expect(workflow).toMatch(/actions\/cache\/save@/u);
  });

  it('is gated on 5-minute load below 8 with Stryker concurrency 1', () => {
    expect(workflow).toMatch(/MUTATION_MAX_LOAD: '8'/u);
    expect(workflow).toMatch(/STRYKER_CONCURRENCY: '1'/u);
    expect(workflow).not.toMatch(/MUTATION_MAX_LOAD: '(?!8')/u);
  });

  it('ranks the sweep by touch (tier weight plus churn)', () => {
    expect(workflow).toMatch(/test-quality-loop\.mjs rank/u);
    expect(workflow).toMatch(/--touch-file/u);
  });

  it('confines its one secret to the issue-filing step and never runs on pull requests', () => {
    const secrets = workflow.match(/\$\{\{\s*secrets\.[A-Z_]+/gu) ?? [];
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatch(/LINEAR_API_KEY/u);
    const step = workflow
      .split('- name: File survivor issues')[1]
      .split(/\n {6}- name:/u)[0];
    expect(step).toMatch(/secrets\.LINEAR_API_KEY/u);
    expect(step).toMatch(/mutation-sweep-file-issues\.mjs/u);
    expect(step).not.toMatch(/mutation-sweep\.mjs|stryker|vitest/iu);
    expect(workflow).not.toMatch(/pull_request/u);
  });

  it('is event-driven: no cron, self-chains through workflow_dispatch only', () => {
    expect(workflow).not.toMatch(/^\s*schedule:/mu);
    expect(workflow).toMatch(
      /cli\.ts gh --priority default -- workflow run mutation-diff\.yml --ref main/u
    );
    expect(workflow).toContain('actions: write');
  });

  it('sweeps trusted main only and serializes on one group', () => {
    const sweep = workflow.slice(workflow.indexOf('\n  sweep:'));
    expect(sweep).toContain("github.ref == 'refs/heads/main'");
    expect(sweep).toMatch(/ref: main\n\s+persist-credentials: false/u);
    expect(sweep).toContain('group: mutation-sweep');
    expect(sweep).toContain('cancel-in-progress: false');
    expect(sweep).toContain('scripts/mutation-sweep-preflight.mjs');
  });
});
