import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
  'utf8'
);

describe('Mutation Diff spare-compute contract', () => {
  it('runs every job on the gem pool with no hosted fallback', () => {
    const runsOn = [...workflow.matchAll(/^\s+runs-on:\s*(.+)$/gmu)].map(
      match => match[1].trim()
    );
    expect(runsOn).toHaveLength(2);
    for (const value of runsOn) {
      expect(value).toBe('[self-hosted, Linux, X64, jovie-fixed]');
    }
    expect(workflow).not.toMatch(/ubuntu-/u);
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

  it('shares idle CPU at the lowest priority instead of gating on a load constant', () => {
    const sweep = workflow.slice(workflow.indexOf('\n  sweep:'));
    expect(sweep).toMatch(/nice -n 19 ionice -c3/u);
    expect(sweep).toMatch(/CPUWeight=1/u);
    const preflight = readFileSync(
      resolve(REPO_ROOT, 'scripts/mutation-sweep-preflight.mjs'),
      'utf8'
    );
    expect(preflight).not.toMatch(/loadavg|MAX_LOAD/u);
  });
});
