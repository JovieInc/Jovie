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

  it('fans broad verification out remotely and cancels stale source heads', () => {
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).not.toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}"
    );
    expect(workflow).toContain(
      "branches: [main, 'integration/**', 'codex/**']"
    );
    expect(workflow).toContain("github.event_name == 'pull_request' ||");
    expect(workflow).toContain('ci-draft-coverage:');
    expect(workflow).toContain('Affected Unit Tests (10 shards)');
    expect(workflow).toContain('coverage ratchet did not pass');
  });
});
