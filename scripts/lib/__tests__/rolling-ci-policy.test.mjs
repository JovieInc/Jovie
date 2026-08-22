import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('draft-first rolling CI policy wiring', () => {
  it('keeps AGENTS as a concise map to the canonical contract', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('docs/PR_FLOW.md');
    expect(agents).toContain('publish the first coherent commit as a draft');
    expect(agents).not.toContain('openai.com/index/harness-engineering');
  });

  it('records every founder-required rolling CI invariant in PR_FLOW', () => {
    const flow = read('docs/PR_FLOW.md');
    for (const invariant of [
      'JOVIE_PUSH_PHASE=publication git push',
      'Per-PR concurrency cancels superseded runs',
      'stale or duplicate deliveries are rejected',
      'One remediation writer holds the PR lease',
      'FX is the recovery tier',
      'final exact, current head',
      'PR #16336',
      'https://openai.com/index/harness-engineering/',
    ]) {
      expect(flow).toContain(invariant);
    }
    expect(flow).toMatch(/Moving on requires an explicit handoff\s+receipt/);
  });

  it('keeps privileged failure dispatch on trusted main without PR checkout', () => {
    const workflow = read('.github/workflows/agent-pipeline.yml');
    expect(workflow).toContain(
      'group: agent-remediation-${{ github.repository }}-'
    );
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('Failure event is stale or ownership changed');
    expect(workflow).not.toContain(
      'ref: ${{ needs.guard.outputs.pr_head_sha }}'
    );
  });
});
