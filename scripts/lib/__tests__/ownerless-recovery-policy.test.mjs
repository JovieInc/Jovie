import { describe, expect, it } from 'vitest';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const created = '2026-08-15T00:00:00.000Z';
const pr = {
  state: 'open',
  assignees: [],
  created_at: created,
  mergeable: true,
  base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
  head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
};

function evaluate() {
  return evaluateRecoveryCandidate({
    pr,
    mainSha: 'b'.repeat(40),
    compare: { behind_by: 0 },
    timeline: [],
    files: ['scripts/ci-merge-queue-check.mjs'],
    patch: '+const timeout = 9;',
    checksPassing: true,
    now: Date.parse('2026-08-15T02:00:00.000Z'),
  });
}

describe('ownerless recovery policy', () => {
  it('admits focused green recovery work after one ownerless hour', () => {
    expect(evaluate().eligible).toBe(true);
  });

  it('allows only non-worsening workflow tuning', () => {
    const classify = patch =>
      classifyRecoveryFiles(['.github/workflows/ci.yml'], patch).eligible;
    expect(
      classify('+run: node -e "process.mainModule.require(`child_process`)"')
    ).toBe(false);
    expect(classify('-timeout-minutes: 10\n+timeout-minutes: 9')).toBe(true);
    expect(classify('-max-parallel: 2\n+max-parallel: 999999')).toBe(false);
  });
});
