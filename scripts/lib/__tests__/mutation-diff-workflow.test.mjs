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

  it('holds no secrets and never runs on pull requests', () => {
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./u);
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
